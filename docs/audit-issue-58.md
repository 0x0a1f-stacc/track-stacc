# Audit Report — Issue #58: fix native presence lifecycle on disconnect, refresh, and reconnect

## Executive Summary
The goal of this audit is to identify the root cause of issues in the native presence lifecycle for collaborative rooms and propose a comprehensive, robust implementation plan. 

Currently, room presence is queried by selecting all database `RoomSession` records where `leftAt` is null. However, `leftAt` is never set to a non-null value during normal socket disconnections or inactivity timeouts. Consequently, the active participant list grows indefinitely, accumulating stale listener and member entries across page refreshes and tab closures. Furthermore, the frontend client does not transmit periodic heartbeats (`presence.heartbeat`), and the server does not enforce a presence timeout lifecycle.

To resolve this, we will introduce a Redis-backed presence tracking system using sorted sets (ZSETs), implement a 25-second client-side heartbeat, and establish a server-side cleanup routine that runs on key realtime/session lifecycle events. This cleanup will transition inactive sessions (no heartbeat for over 60 seconds) to a left state (`leftAt = now`) in the database. When Redis is degraded or unavailable, the system will fall back gracefully to a bounded PostgreSQL query and cleanup, ensuring that presence remains correct and does not produce duplicate participant rows.

---

## Issue Decomposition

The fix for the presence lifecycle is decomposed into six logical, sequential work packages:

### 1. Define Presence Identity Keying
*   **Goal**: Establish the stable identity of a participant in the room.
*   **Key Design**: The presence tracker will key participant identity by `roomSessionId` (the UUID from the `RoomSession` model). 
*   **Multi-Tab Behavior**: If a user has multiple tabs open under the same session cookie, they will share the same `roomSessionId` and be treated as a single participant row.
*   **Upgrade Behavior**: When a Listener upgrades to a Member via `/join`, the underlying session record is updated in place, retaining the same `roomSessionId`.
*   **Likely Files**: `apps/api/src/realtime/presence.manager.ts`.

### 2. Implement Client-Side Heartbeats
*   **Goal**: Ensure the client periodically updates its presence on the server.
*   **Behavior**: When a valid WebSocket connection is established, the client will send a `presence.heartbeat` event every 25 seconds.
*   **Likely Files**: `apps/web/src/hooks/useSocket.ts`, `apps/web/src/components/room/RoomShell.tsx`.
*   **Expected Tests**: Client-side hook mounts and sets up interval; unmounts and clears interval.

### 3. Implement Redis ZSET-Based Presence Tracking
*   **Goal**: Store active session presence in Redis for high-speed, distributed querying.
*   **Structure**: 
    *   Redis Key: `room:${roomId}:presence`
    *   Data Structure: Sorted Set (ZSET)
    *   Member: `sessionId` (UUID)
    *   Score: `timestamp` (millisecond epoch)
*   **Operations**: ZADD on connect and heartbeat. Key TTL set to 24 hours to prevent leaks.
*   **Likely Files**: `apps/api/src/realtime/presence.manager.ts`, `apps/api/src/realtime/gateway.ts`.

### 4. Implement Server-Side Inactivity Cleanup
*   **Goal**: Sweep inactive sessions and mark them as left.
*   **Mechanism**: A self-cleaning utility `cleanupInactiveSessions(app, roomId)` that:
    1.  Identifies sessions in the ZSET with scores older than 60 seconds.
    2.  Removes them from the ZSET.
    3.  Sets `leftAt = now` in PostgreSQL for those sessions.
    4.  Broadcasts the updated participant list to the room.
*   **Integration**: Run this clean-up inside `listenToRoom` (before checking credentials), Socket.IO connection setup, heartbeat handler, and disconnection handler.
*   **Likely Files**: `apps/api/src/realtime/presence.manager.ts`, `apps/api/src/modules/sessions/sessions.service.ts`, `apps/api/src/modules/nicknames/nicknames.service.ts`.

### 5. Reconcile Snapshot & Active Participants
*   **Goal**: Re-author the participant list construction to only return online/active participants.
*   **Behavior**: Update `getParticipants(app, roomId)` to read active session IDs from Redis (ZSET score check) and query PostgreSQL only for those IDs.
*   **Likely Files**: `apps/api/src/realtime/presence.manager.ts`.

### 6. Bounded Redis-Degraded Fallback
*   **Goal**: Ensure presence works gracefully when Redis is down.
*   **Behavior**: Catch Redis errors, log a warning, and fall back to querying PostgreSQL directly:
    *   Query active sessions where `lastSeenAt >= now - 60 seconds` and `leftAt === null`.
    *   Clean up Postgres directly by marking sessions with `lastSeenAt < now - 60 seconds` as `leftAt = now`.
*   **Likely Files**: `apps/api/src/realtime/presence.manager.ts`.

---

## Relevant Code Inventory

### 1. `apps/api/src/realtime/presence.manager.ts`
*   **Responsibility**: Defines helper to fetch active room participants.
*   **Current Logic**:
    ```typescript
    export async function getParticipants(app: FastifyInstance, roomId: string) {
      const activeSince = new Date(Date.now() - 90_000);
      const sessions = await app.prisma.roomSession.findMany({
        where: { roomId, leftAt: null },
        orderBy: { joinedAt: "asc" },
      });
      // ... maps all leftAt: null sessions to online/offline state
    }
    ```
*   **Required Changes**:
    *   Introduce `cleanupInactiveSessions(app, roomId)`.
    *   Modify `getParticipants` to query the ZSET `room:${roomId}:presence` (scores > `now - 60_000`), then select matching SQL rows where `leftAt: null`.
    *   Implement try-catch block around Redis commands to fall back to `lastSeenAt` filtering in PostgreSQL when Redis is degraded.

### 2. `apps/api/src/realtime/gateway.ts`
*   **Responsibility**: Socket.IO connection and disconnection bootstrap.
*   **Current Logic**:
    *   On `"connection"`, it updates `lastSeenAt: new Date(), leftAt: null` in PostgreSQL.
    *   On `"disconnect"`, it updates `lastSeenAt: new Date()` in PostgreSQL and broadcasts `presence.updated`.
*   **Required Changes**:
    *   On `"connection"`: ZADD the session to `room:${roomId}:presence` in Redis. Run cleanup of inactive sessions.
    *   On `"disconnect"`: Check if the session has any other active socket connections on the current instance (via `io.in(roomChannel(roomId)).fetchSockets()`). If not, optionally remove it from the Redis ZSET immediately to accelerate participant list updates, but let the timeout handle PostgreSQL `leftAt` updates to allow page refresh survival.

### 3. `apps/api/src/realtime/room.gateway.ts`
*   **Responsibility**: Realtime event multiplexer.
*   **Current Logic**:
    *   Listens to `"presence.heartbeat"` and updates `lastSeenAt = now` in PostgreSQL, then broadcasts.
*   **Required Changes**:
    *   Also update the ZSET score in Redis for this session. Run room cleanup.

### 4. `apps/api/src/modules/sessions/sessions.service.ts`
*   **Responsibility**: Contains `listenToRoom` which bootstraps/rehydrates room sessions.
*   **Current Logic**: Checks if `existingSession` has `leftAt === null` to rehydrate it.
*   **Required Changes**: Run `cleanupInactiveSessions` before resolving/rehydrating the session. This ensures a session that has timed out gets marked as left first, prompting the expected bootstrap behavior.

### 5. `apps/api/src/modules/nicknames/nicknames.service.ts`
*   **Responsibility**: Handles member join and listener upgrade (`joinRoom`).
*   **Current Logic**:
    *   Checks nickname uniqueness against sessions in the same room where `leftAt === null`.
*   **Required Changes**: Run `cleanupInactiveSessions` before executing nickname checks, ensuring timed-out sessions do not trigger stale `NICKNAME_TAKEN` errors.

### 6. `apps/web/src/stores/room.store.ts`
*   **Responsibility**: Room state store.
*   **Current Logic**: Updates the entire `participants` array upon receiving `room.snapshot` or `presence.updated`.
*   **Required Changes**: None. The store is already authoritative and replaces the list.

### 7. `apps/web/src/components/room/RoomShell.tsx`
*   **Responsibility**: Main React UI shell for active rooms.
*   **Required Changes**: Add a `useEffect` interval to emit `presence.heartbeat` every 25 seconds when the WebSocket token is present.

### 8. `prisma/schema.prisma`
*   **Responsibility**: Database schema mapping.
*   **Current Indexes**:
    *   `@@unique([roomId, normalizedNickname, leftAt])`: Enforces single active session per nickname.
    *   `@@index([roomId, lastSeenAt])`: Optimizes direct PostgreSQL lookup of active sessions.
*   **Required Changes**: None. Schema indices are already optimized for fallback operation.

---

## Monorepo Package Boundaries

*   **`packages/types`**: Houses all shared WebSocket and domain interfaces. Since `presence.heartbeat` (Client-to-Server) and `presence.updated` / `room.snapshot` (Server-to-Client) contracts are already defined, **no changes are needed here**.
*   **`apps/api`**: Needs changes to manage the Redis presence cache, DB cleanup, and heartbeat handler.
*   **`apps/web`**: Needs changes to emit the periodic heartbeat event.
*   **Verification**:
    *   API compilation/tests: `pnpm --filter api typecheck && pnpm --filter api test`
    *   Web compilation: `pnpm --filter web typecheck && pnpm --filter web build`

---

## Dependencies & Blockers

*   **Prisma & PostgreSQL Schema**: Relies on `lastSeenAt` and `leftAt` columns. The schema is static and correct; no migrations are required.
*   **Redis Integration**: Relies on `app.redis` (`ioredis`) decorator. Assumes the Redis service is running locally on port `6379`.
*   **External Integrations**: Site integrations and external participants (Issue #32) are safely out of scope.
*   **Auth / Session token structure**: Rehydration cookie logic remains unmodified.
*   **Blockers**: No outstanding blockers. The current local database and Redis services are sufficient to implement this fix.

---

## Data & State Flow

### Scenario 1: New Anonymous Listener Opens Room
```text
GET Room URL → Web client calls POST /listen → sessions.service creates room_session (leftAt: null, accessTier: "listener") → returns cookie token + WS token → Client connects Socket.IO → gateway.ts ZADDs session ID to Redis ZSET → returns room.snapshot (carrying participants list) → UI renders active listener
```

### Scenario 2: Listener Refreshes Room Repeatedly
```text
Page reload closes socket → Client calls POST /listen with cookie → sessions.service rehydrates existing session (leftAt is null and not yet timed out) → returns same WS token → Client reconnects Socket.IO → gateway ZADDs session ID back with fresh score → room.snapshot returned → UI renders without duplicate entries
```

### Scenario 3: Listener Upgrades to Member
```text
Click Chat/Join → POST /join with listenerSessionId → nicknames.service validates listener session, checks uniqueness, upgrades accessTier to "member" in-place → returns same cookie + member WS token → Client disconnects listener socket + connects member socket with new token → ZADD score updated → presence.updated broadcast → UI updates role to member
```

### Scenario 4: Authenticated Member Refreshes/Reconnects
```text
Reload closes socket → Client calls POST /listen with cookie → sessions.service finds member session (leftAt is null) → rehydrates it → returns member WS token → Client connects Socket.IO → ZADD score updated → snapshot returned → UI renders member online
```

### Scenario 5: Host Refreshes/Reconnects
```text
Same flow as Scenario 4. Host session is preserved in-place, preventing stale host rows from accumulating.
```

### Scenario 6: WebSocket Transient Drop and Reconnect
```text
WS drops → Socket.IO client backs off & reconnects using existing token → server verifies WS token → updates ZSET score in Redis → server emits room.snapshot → client applies snapshot directly, keeping presence unified
```

### Scenario 7: Browser Tab Closes Without Cleanup
```text
Tab closes → Socket disconnects → Heartbeats stop → Later request or background connection triggers cleanupInactiveSessions → Redis ZSET ZRANGEBYSCORE finds expired session ID (inactive >60s) → ZREMRANGEBYSCORE removes it → PostgreSQL updates leftAt = now for session → presence.updated broadcast → frontend removes participant
```

### Scenario 8: Redis is Down (Degraded Mode)
```text
WS connect/heartbeat fails to update Redis (caught and logged) → Fallback to Postgres direct update of lastSeenAt → getParticipants catches Redis error and runs SELECT from room_sessions WHERE roomId = roomId AND lastSeenAt >= now - 60s AND leftAt = null → cleanupInactiveSessions marks inactive DB sessions as leftAt = now → active list is bounded, no duplicates are created
```

---

## Edge Cases & Risk Surface

1.  **Old socket disconnect fires AFTER new socket connects on refresh:**
    *   *Risk*: When a user refreshes, the new tab connects a socket before the old socket disconnect cleanup finishes.
    *   *Mitigation*: The ZSET score is updated by the new socket connection. Disconnect handlers only clean up session state if there are no other active socket connections matching that `sessionId` on the server instance. Furthermore, the database `leftAt` update is deferred to the 60-second inactivity sweep rather than being set immediately on socket disconnect, preventing session invalidation during refreshes.
2.  **Multiple tabs open under same session:**
    *   *Risk*: Closing one tab causes the user to disappear.
    *   *Mitigation*: Heartbeats from the remaining tab(s) will continue to update the Redis ZSET score. The session is only considered inactive when all tabs are closed and heartbeats cease for 60 seconds.
3.  **Clock skew between API server and Redis server:**
    *   *Risk*: Inconsistent timestamps cause premature timeouts.
    *   *Mitigation*: Use the API server's local time (`Date.now()`) as the score in ZADD operations, ensuring consistent comparison metrics.
4.  **Redis goes down during active room play:**
    *   *Risk*: Infinite duplicates or DB query slow-down.
    *   *Mitigation*: Catch Redis exceptions in the presence manager. Fall back to PostgreSQL `lastSeenAt` filtering. Since fallback filters on `lastSeenAt >= now - 60_000`, the database results are naturally bounded, preventing infinite participant listings.
5.  **Sensitive data exposure in participant payloads:**
    *   *Risk*: Session cookie tokens or secrets are sent in participant payload.
    *   *Mitigation*: Ensure `getParticipants` only returns public identity fields (`roomSessionId`, `displayNickname`, `normalizedNickname`, `accessTier`, `role`, `presence`, `isMuted`, `joinedAt`, `lastSeenAt`). Never return `sessionTokenHash` or claim secrets.

---

## SDD Sections Relevant to This Issue

*   **§7.9 — Presence**: Specifies that presence updates when users connect, disconnect, or go idle (`FR-090`, `FR-091`).
*   **§10.2 — Open Room and Join Flow**: Details room rehydration.
*   **§14.2 — room_sessions data model**: Outlines schema fields (`last_seen_at`, `left_at`).
*   **§16.1.1 — Reconnection Backoff**: Details client reconnect sequences.
*   **§16.2 — Client-to-Server Events**: Lists client heartbeats.
*   **§23.6 — Redis degradation and circuit breakers**: Specifies that when Redis is degraded, presence should be marked approximate, writes requiring rate limiting fail closed, but PostgreSQL reads remain valid.
*   **§26 — Testing Strategy**: Guides unit and integration test layout.

---

## Patterns & Conventions to Follow

1.  **Keep route handlers thin**: Keep logic separated into domain managers (e.g. `presence.manager.ts`).
2.  **Use registered error codes**: Raise `AppError` using errors defined in `apps/api/src/lib/error-codes.ts` (e.g., `SESSION_INVALID`).
3.  **Zod validation**: Validate all incoming websocket events and REST payloads at boundaries.
4.  **No `any` keyword**: Adhere to TypeScript `strict` mode constraints.
5.  **Naming conventions**:
    *   Database fields: `snake_case` (handled by Prisma `@map`).
    *   JSON Payloads / WebSocket data keys: `camelCase`.
    *   WebSocket event names: `dot.separated` (e.g., `presence.heartbeat`, `presence.updated`).
    *   Error codes: `UPPER_SNAKE_CASE`.

---

## Documentation Gaps

After implementing the changes, the following documents should be reviewed and updated to reflect the design:
*   `docs/sdd.md`: Update §7.9 (Presence) and §16.2 / §16.3 to document the Redis ZSET schema, fallback database execution flow, and client heartbeat interval.
*   `docs/ai/trackstacc-feature-maps.md`: Update the presence flow chart to include the Redis ZSET storage layer.

---

## Recommended Implementation Plan

We recommend a single focused PR containing these parts:

### Part 1: API Redis ZSET and Inactivity Cleanup
*   **Goal**: Create ZSET presence manager helper and DB inactivity sweep function.
*   **Files touched**: `apps/api/src/realtime/presence.manager.ts`.
*   **Implementation details**:
    *   Add `cleanupInactiveSessions(app, roomId)` to scan and prune expired sessions, setting `leftAt = new Date()` in PostgreSQL.
    *   Re-author `getParticipants(app, roomId)` to read active members from Redis, falling back to PostgreSQL direct query on Redis failures.

### Part 2: Gateway & REST Integrations
*   **Goal**: Connect gateway event handlers and HTTP endpoints to the presence tracking hooks.
*   **Files touched**:
    *   `apps/api/src/realtime/gateway.ts`
    *   `apps/api/src/realtime/room.gateway.ts`
    *   `apps/api/src/modules/sessions/sessions.service.ts`
    *   `apps/api/src/modules/nicknames/nicknames.service.ts`
*   **Implementation details**:
    *   Invoke `cleanupInactiveSessions` at `/listen` (rehydration check), `/join` (nickname collision check), Socket.IO `"connection"`, `"disconnect"`, and `"presence.heartbeat"` handlers.
    *   Add session to Redis ZSET on socket connection and heartbeat events.

### Part 3: Client Heartbeats
*   **Goal**: Transmit heartbeats from the client application.
*   **Files touched**: `apps/web/src/components/room/RoomShell.tsx`.
*   **Implementation details**:
    *   Use a React `useEffect` hook to set up a 25-second interval when the WS token is set, emitting `presence.heartbeat`.

### Part 4: Automated Testing
*   **Goal**: Ensure zero regressions and assert presence behavior under mock Redis degradation.
*   **Files to create/extend**:
    *   Extend `apps/api/src/__tests__/realtime.test.ts` to mock Redis ZSET commands and assert correct participant counts after multiple mock heartbeats.
    *   Add integration tests verifying that a session is marked `leftAt !== null` in the database after simulated 60-second inactivity.
    *   Assert fallback query returns valid participants when Redis queries reject with connection errors.
*   **Verification Command**: `pnpm --filter api test`
