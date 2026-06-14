# trackstacc-integration-matrix.md

> **Engineering Knowledge-Graph Layer — Deliverable 3 of 7**
> Per-endpoint implementation reference: for every API endpoint, the tables it reads, the tables it writes, the WebSocket events it emits, the security controls applied, its rate limit, and the acceptance criteria that validate it.
> This is the **primary implementation reference** for coding agents. Endpoints are verbatim from SDD §15.2 under the canonical `/api/` version (§15.1, `API-CONV`). Reads/writes derive from §37.1 + §14 + the §4.2/§4.3 cross-maps. Emitted events from §16 + the §4.4 cross-map. Rate-limit values from App. A and §8 NFRs where the SDD gives concrete numbers; otherwise the **control class** is named (per-user / per-room / per-integration / per-command, FR-172, NFR-035).

**Authority reminders:** All external (`/integrations/*`, `/embed/*`) security defers to `SEC-EXTINTEG` (§19.5, authoritative). Every native mutating route is behind `SEC-TIER` (member) per FR-028 — listed once here, enforced everywhere. Error codes are canonical per `ERR-REGISTRY` (§23.4). Rate-limit responses carry headers per `API-CONV` (§15.1).

---

## Legend

- **Reads / Writes** — durable PostgreSQL tables (`DATA-*`) unless noted; Redis is called out explicitly (rate limits, presence, idempotency).
- **Emits** — server→client `WS-*` events broadcast as a result; `room.snapshot` is sent on connect, not per call.
- **Tier** — minimum native access tier required (`listener` / `member` / `host` / `mod`), enforced server-side by `SEC-TIER`.
- **Rate limit** — concrete value where the SDD specifies one; else control class.

---

## API-ROOMS — Room endpoints (§15.2)

### `POST /api/rooms`
- **Purpose:** Create a room without registration (FR-001–006).
- **Reads:** — (validates input)
- **Writes:** `rooms` (`DATA-ROOMS`: `host_secret_hash`, `playlist_mechanic`, config, optional `password_hash`)
- **Emits:** — (room live on first connect → `room.snapshot`)
- **Security:** `SEC-SESSION` (issues host session + WS token); `SEC-CORS` first-party only; host secret hash-only
- **Tier:** none to create; **host must protect a nickname to act** (`AC-V140-7`)
- **Rate limit:** room-creation burst control (per-IP/session); **fails closed if Redis down** (§23.6)
- **Acceptance:** `AC-RC-1`, `AC-RC-3`
- **Errors:** `VALIDATION_FAILED`

### `GET /api/rooms/:roomId`
- **Purpose:** Fetch room state/config.
- **Reads:** `rooms`, `room_settings_history` (effective settings); `queue_items`/`tracks` for preview where included
- **Writes:** —
- **Emits:** —
- **Security:** `SEC-CORS`; `ROOM_PASSWORD_REQUIRED` if protected
- **Tier:** `listener`
- **Rate limit:** standard read (per-session)
- **Acceptance:** `AC-RC-3`
- **Errors:** `ROOM_NOT_FOUND` (404)

### `PATCH /api/rooms/:roomId/settings`
- **Purpose:** Update room settings incl. playlist mechanic, duration, duplicate policy, skip threshold, `listener_chat_visible`, visibility (FR-055–060, FR-078, FR-100–106).
- **Reads:** `rooms`
- **Writes:** `rooms`, `room_settings_history` (`DATA-SETTINGSHIST`)
- **Emits:** `WS-S2C` `room.mechanic.changed` (mechanic) **or** `room.settings.changed` (other); system `chat.message` on mechanic change
- **Security:** `HOST_REQUIRED`; server-side role check (§19.2)
- **Tier:** `host`
- **Rate limit:** public-room mechanic-change cooldown **5 min** (App. A); → `MECHANIC_CHANGE_COOLDOWN`
- **Acceptance:** `AC-MECH-1`…`AC-MECH-6`, `AC-CHAT-2` (listener visibility)
- **Errors:** `HOST_REQUIRED` (403), `MECHANIC_CHANGE_COOLDOWN` (429), `VALIDATION_FAILED`

### `POST /api/rooms/:roomId/join` (Host Activation Flow)
- **Purpose:** Claim host authority via host secret/cookie during protected nickname join/upgrade (FR-003).
- **Reads:** `rooms` (`host_secret_hash`)
- **Writes:** `room_sessions` (upgrades session to member tier and sets role to host); token rotation
- **Emits:** `WS-CONN` re-auth (rotated token)
- **Security:** `SEC-SESSION` (rotate on privilege escalation, §19.4); hash compare only
- **Tier:** elevates session to `host` role (member tier)
- **Rate limit:** nickname rate limits and attempt controls
- **Acceptance:** `AC-RC-2`, `AC-V140-7`
- **Errors:** `NICKNAME_PROTECTION_REQUIRED` (409), `NICKNAME_TAKEN` (409)

### `POST /api/rooms/:roomId/password/verify`
- **Purpose:** Verify room password to gain entry (FR-004/106).
- **Reads:** `rooms` (`password_hash`)
- **Writes:** `room_sessions` (entry grant)
- **Emits:** —
- **Security:** `SEC-PWD` pattern; rate-limited
- **Tier:** `listener` (entry)
- **Rate limit:** per-session/IP attempt control → `ROOM_PASSWORD_INCORRECT` then backoff
- **Acceptance:** `AC-RC-3`
- **Errors:** `ROOM_PASSWORD_REQUIRED` (401), `ROOM_PASSWORD_INCORRECT` (403)

---

## API-NICK — Nickname & session endpoints (§15.2) — the `SEC-TIER` surface

### `POST /api/nicknames/check`
- **Purpose:** Check nickname availability/normalization before claim (FR-012, FR-018).
- **Reads:** `nickname_claims` (`DATA-NICKNAMES`)
- **Writes:** —
- **Emits:** —
- **Security:** reserved/offensive blocking (DL-008)
- **Tier:** `listener`
- **Rate limit:** per-session
- **Acceptance:** `AC-JOIN-2`
- **Errors:** `NICKNAME_TAKEN` (409), `VALIDATION_FAILED`

### `POST /api/nicknames/protect`
- **Purpose:** Claim/protect a nickname by setting a password (FR-020, FR-021).
- **Reads:** `nickname_claims`
- **Writes:** `nickname_claims` (`password_hash` via Argon2id)
- **Emits:** system `chat.message` "protected their nickname" (in-room)
- **Security:** `SEC-PWD` (Argon2id, never plaintext/log/return — §19.3); min 10 chars (DL-009)
- **Tier:** `listener` → enables `member`
- **Rate limit:** per-IP/session claim control
- **Acceptance:** `AC-V140-3`, `AC-JOIN-3`
- **Errors:** `NICKNAME_TAKEN` (409), `VALIDATION_FAILED` (weak password)

### `POST /api/nicknames/authenticate`
- **Purpose:** Authenticate an existing protected nickname (FR-014, FR-022).
- **Reads:** `nickname_claims`
- **Writes:** Redis (failed-attempt counters)
- **Emits:** —
- **Security:** `SEC-PWD`; brute-force rate limits by nickname/IP/global (§19.2)
- **Tier:** `listener` → enables `member`
- **Rate limit:** failed-attempt rate limit (FR-023) → `NICKNAME_PASSWORD_RATE_LIMITED`; **fails closed if Redis down** (§23.6)
- **Acceptance:** `AC-JOIN-3`, `AC-JOIN-4`
- **Errors:** `NICKNAME_PROTECTED` (409), `NICKNAME_PASSWORD_INCORRECT` (403), `NICKNAME_PASSWORD_RATE_LIMITED` (429)

### `POST /api/rooms/:roomId/listen`
- **Purpose:** Establish a read-only Listener session (FR-019). Primary bootstrap and rehydration path. If client sends a valid session cookie representing an existing host or member session, rehydrates that session and returns the correct access tier and a fresh WebSocket token instead of creating a new Listener session or overwriting the cookie.
- **Reads:** `rooms`, `room_sessions` (for rehydration)
- **Writes:** `room_sessions` (`access_tier = listener` / reuses existing session)
- **Emits:** `WS-CONN` `room.snapshot`
- **Security:** `SEC-TIER` (tier encoded in token); `ROOM_PASSWORD_REQUIRED` if protected
- **Tier:** issues `listener` or rehydrates existing tier (`member`/`host`)
- **Rate limit:** per-session
- **Acceptance:** `AC-V140-1`, `AC-JOIN-1`
- **Errors:** `ROOM_PASSWORD_REQUIRED` (401)

### `POST /api/rooms/:roomId/join`
- **Purpose:** Establish or upgrade to a member session; authenticate existing or claim new nickname in one protect-and-join step; upgrades a Listener session **in place** (FR-010, FR-014, FR-015). Reuses existing active session and replaces WebSocket token, prompting presence update broadcast.
- **Reads:** `rooms`, `nickname_claims`
- **Writes:** `room_sessions` (`access_tier = member`, in-place upgrade), `nickname_claims` (on new claim), Redis (failed-attempt counters)
- **Emits:** `WS-S2C` `presence.updated`; system `chat.message` (join / protect)
- **Security:** `SEC-TIER`, `SEC-SESSION` (token now carries `member`), `SEC-PWD`
- **Tier:** `listener` → `member`
- **Rate limit:** failed-password rate limit (FR-022/023); **fails closed if Redis down**
- **Acceptance:** `AC-V140-3`, `AC-V140-4`, `AC-JOIN-1`, `AC-JOIN-3`, `AC-JOIN-4`
- **Errors:** `NICKNAME_PROTECTION_REQUIRED` (409), `NICKNAME_PROTECTED` (409), `NICKNAME_PASSWORD_INCORRECT` (403), `NICKNAME_TAKEN` (409), `NICKNAME_PASSWORD_RATE_LIMITED` (429)

### `POST /api/rooms/:roomId/nickname/change`
- **Purpose:** Change to another protected nickname (FR-017).
- **Reads:** `nickname_claims`
- **Writes:** `room_sessions`, Redis (rate counters)
- **Emits:** `WS-S2C` `presence.updated`; system `chat.message`
- **Security:** `SEC-TIER` (member), `SEC-PWD`; rate-limited
- **Tier:** `member`
- **Rate limit:** per-user change rate limit
- **Acceptance:** `AC-JOIN-3`
- **Errors:** `NICKNAME_PASSWORD_INCORRECT` (403), `NICKNAME_PASSWORD_RATE_LIMITED` (429)

---

## API-QUEUE — Queue & playback endpoints (§15.2)

### `POST /api/rooms/:roomId/queue/items`
- **Purpose:** Add a song by YouTube URL with validation/dedup/duration checks (FR-030–034, FR-050–053).
- **Reads:** `rooms` (`max_song_duration_seconds`, duplicate/lock policy), `queue_items` (dedup), `tracks` (cache)
- **Writes:** `queue_items` (`DATA-QUEUE`), `tracks` (`DATA-TRACKS`, metadata cache)
- **Emits:** `WS-QUEUE` `queue.item.added`, `queue.updated`
- **Security:** `SEC-TIER` (member); YouTube API key server-side; YouTube circuit breaker (§23.6)
- **Tier:** `member`
- **Rate limit:** add-song cooldown **30s** (App. A); per-user queue limits
- **Acceptance:** `AC-QUEUE-1`…`AC-QUEUE-3`
- **Errors:** `VIDEO_URL_INVALID` (400), `VIDEO_UNAVAILABLE` (422), `VIDEO_TOO_LONG` (422), `DUPLICATE_VIDEO` (409), `QUEUE_LOCKED` (403), `QUEUE_FULL` (409), `YOUTUBE_METADATA_DEGRADED` (503), `LISTENER_READ_ONLY` (403)

### `DELETE /api/rooms/:roomId/queue/items/:queueItemId`
- **Purpose:** Remove a queue item (host/mod, FR-082).
- **Reads:** `queue_items`
- **Writes:** `queue_items` (removed state), `room_moderation_actions` (audit)
- **Emits:** `WS-QUEUE` `queue.item.removed`, `queue.updated`
- **Security:** `MODERATOR_REQUIRED`; audit (NFR-067)
- **Tier:** `mod`/`host`
- **Rate limit:** per-user mod-action control
- **Acceptance:** `AC-QUEUE-4`
- **Errors:** `MODERATOR_REQUIRED` (403), `QUEUE_ITEM_NOT_FOUND` (404)

### `POST /api/rooms/:roomId/queue/items/:queueItemId/vote`
- **Purpose:** Cast a queue vote (voting mechanic, FR-051).
- **Reads:** `queue_items`, `queue_votes`
- **Writes:** `queue_votes` (`DATA-VOTES`), `queue_items.score`
- **Emits:** `WS-QUEUE` `queue.vote.updated`, `queue.updated`
- **Security:** `SEC-TIER` (member); one vote per user (upvote-only MVP, DL-006)
- **Tier:** `member`
- **Rate limit:** per-user vote control
- **Acceptance:** `AC-QUEUE-4`
- **Errors:** `VOTE_NOT_ALLOWED` (403), `QUEUE_ITEM_NOT_FOUND` (404)

### `POST /api/rooms/:roomId/queue/items/:queueItemId/approve` · `.../reject`
- **Purpose:** Host-curated / moderated-suggestion approval flow (FR-053, FR-054 Phase 2).
- **Reads:** `queue_items`
- **Writes:** `queue_items` (state)
- **Emits:** `WS-QUEUE` `queue.updated`
- **Security:** `MODERATOR_REQUIRED`
- **Tier:** `mod`/`host`
- **Rate limit:** per-user mod-action control
- **Acceptance:** `AC-QUEUE-4`
- **Errors:** `MODERATOR_REQUIRED` (403), `QUEUE_ITEM_NOT_FOUND` (404)

### `POST /api/rooms/:roomId/playback/skip`
- **Purpose:** Host/mod force-skip current track (FR-042).
- **Reads:** `queue_items` (current)
- **Writes:** `queue_items` (advance), `room_moderation_actions` (audit)
- **Emits:** `WS-PLAYBACK` `playback.state`
- **Security:** `MODERATOR_REQUIRED`; audit
- **Tier:** `mod`/`host`
- **Rate limit:** per-user mod-action control
- **Acceptance:** `AC-PLAY-3`
- **Errors:** `MODERATOR_REQUIRED` (403), `TRACK_NOT_FOUND` (404)

### `POST /api/rooms/:roomId/playback/skip-vote`
- **Purpose:** Participant vote-to-skip (FR-043).
- **Reads:** `skip_votes`, `room_sessions` (active non-muted count)
- **Writes:** `skip_votes` (`DATA-SKIPVOTES`)
- **Emits:** `WS-PLAYBACK` `playback.skipVote`; `playback.state` on advance
- **Security:** `SEC-TIER` (member)
- **Tier:** `member`
- **Rate limit:** one active skip-vote per user
- **Acceptance:** `AC-PLAY-3`
- **Errors:** `VOTE_NOT_ALLOWED` (403); skip threshold default 50% / min 2 (App. A)

---

## API-CHAT — Chat endpoints (§15.2)

### `GET /api/rooms/:roomId/chat/messages?before=<cursor>&limit=<n>`
- **Purpose:** Paginated chat history (FR-070, cursor pagination per §15.1; cap 100, DL-004).
- **Reads:** `chat_messages` (`DATA-CHAT`)
- **Writes:** —
- **Emits:** —
- **Security:** `SEC-TIER` — listeners read only if `listener_chat_visible = true` (FR-078)
- **Tier:** `member` (or `listener` when visibility enabled)
- **Rate limit:** per-session read
- **Acceptance:** `AC-CHAT-1`, `AC-CHAT-2`
- **Errors:** `LISTENER_READ_ONLY` (403, when visibility disabled)

> **Note:** Real-time chat *send* is a WebSocket event (`WS-CHAT` `chat.send`), not a REST endpoint — see WS section. The chat rate limit (5 msg/10s, App. A) applies there.

### `DELETE /api/rooms/:roomId/chat/messages/:messageId`
- **Purpose:** Host/mod delete a message (FR-075).
- **Reads:** `chat_messages`
- **Writes:** `chat_messages` (`deleted_at`), `room_moderation_actions` (audit)
- **Emits:** `WS-CHAT` `chat.deleted`; `WS-MOD` `moderation.applied`
- **Security:** `MODERATOR_REQUIRED`; audit
- **Tier:** `mod`/`host`
- **Rate limit:** per-user mod-action control
- **Acceptance:** `AC-CHAT-3`
- **Errors:** `MODERATOR_REQUIRED` (403), `CHAT_MESSAGE_NOT_FOUND` (404)

---

## API-MOD — Moderation endpoints (§15.2)

### `POST /api/rooms/:roomId/moderation/{mute,unmute,ban,unban,assign-moderator,revoke-moderator}`
- **Purpose:** Native moderation suite (FR-080–085).
- **Reads:** `room_sessions`, `room_moderation_actions`
- **Writes:** `room_sessions` (`is_muted`/`is_banned`/role), `room_moderation_actions` (`DATA-MODACTIONS`, audit)
- **Emits:** `WS-MOD` `moderation.applied`; system `chat.message`
- **Security:** `HOST_REQUIRED` (assign/revoke, ban) / `MODERATOR_REQUIRED` (mute); server-side role check on every write (§19.2 #7); audit (NFR-067)
- **Tier:** `mod`/`host` (per action)
- **Rate limit:** per-user mod-action control
- **Acceptance:** moderation criteria (`MOD-NATIVE`); `AC-CHAT-3`/`AC-CHAT-4`
- **Errors:** `MODERATOR_REQUIRED` (403), `HOST_REQUIRED` (403), `BANNED` (403), `MUTED` (403)

---

## API-INTEG — External integration, embed & site-command endpoints (§15.2) — `SEC-EXTINTEG` authoritative (§19.5)

### `POST /api/rooms/:roomId/integrations/site` · `PATCH`/`DELETE .../integrations/site/:integrationId`
- **Purpose:** Create/update/delete a site integration: origins, channel ID, command prefix, webhook URL, enabled commands, staff mappings (FR-110, FR-111).
- **Reads:** `rooms`, `site_integrations`
- **Writes:** `site_integrations` (`DATA-INTEGRATIONS`, secret hashes), `rooms.external_chat_music` (`DATA-EXTCONFIG` JSONB)
- **Emits:** `WS-INTEG` `room.external_settings.changed`
- **Security:** `HOST_REQUIRED`; **`SEC-EXTINTEG`** — one-time server-side secret material, public token ≠ secret; `SEC-CORS` per-integration `allowed_origins`; unique command prefix (DL-018)
- **Tier:** `host`
- **Rate limit:** per-host config control
- **Acceptance:** `AC-EXT-1`, `AC-EXT-2`
- **Errors:** `HOST_REQUIRED` (403), `EXTERNAL_INTEGRATION_NOT_FOUND` (404), `VALIDATION_FAILED`

### `POST /api/integrations/site-command`  ★ server-to-server, the external command spine
- **Purpose:** Single ingress for all external chat commands — `!sr`, `!yay`/`!nay`, `!song`/`!np`, `!queue`, `!rm`, `!skip`, `!music ...` (FR-115–119, FR-130–168, FR-170–179).
- **Reads:** `site_integrations` (auth/config), `external_participants` (identity/mute), `external_commands` (idempotency), `external_references`, `rooms`/`external_chat_music` (policy), `queue_items`, `preplay_veto_windows`/`preplay_veto_votes`, Redis (rate counters)
- **Writes (command-dependent):** `external_commands` (always, audit + idempotency), `external_participants` (mute/identity), `queue_items` (`!sr`/`!rm`), `queue_votes`/`preplay_veto_votes` (votes), `preplay_veto_windows`, `rooms`/`external_chat_music` (`!music` settings), `room_settings_history`, `room_moderation_actions` (mute/skip)
- **Emits (command-dependent):** `WS-INTEG` `integration.command.received/accepted/rejected`, `external.bot_message.created`; `WS-QUEUE` `queue.item.added`/`removed`/`veto_window.*`/`vetoed`/`veto_passed`; `WS-PLAYBACK` `playback.state` (`!skip`, advance); `room.external_settings.changed`
- **Security:** **`SEC-EXTINTEG` (§19.5, authoritative)** — HMAC/bearer auth + timestamp freshness + replay protection + idempotency by message ID + strict schema validation; sanitization; signed outbound; staff authz server-side
- **Tier:** N/A (external; never gated on native nickname); staff/mute state governs capability
- **Rate limit:** **per-integration, per-room, per-user, per-command** (FR-172, NFR-063); SR cooldown default 90s, max pending 2, max queue 50 (App. A); **fails closed if Redis down** (§23.6.2 #2)
- **Acceptance:** `AC-EXT-4`…`AC-EXT-8`, `AC-VETO-1`…`AC-VETO-7`, `AC-STAFF-1`…`AC-STAFF-11`
- **Errors:** `INTEGRATION_AUTH_INVALID` (401), `EXTERNAL_COMMAND_REPLAY` (409), `EXTERNAL_COMMAND_DUPLICATE` (409, returns original), `INVALID_COMMAND_SYNTAX` (400), `EXTERNAL_COMMAND_UNAUTHORIZED` (403), `EXTERNAL_ROLE_UNTRUSTED` (403), `EXTERNAL_USER_MUTED` (403), `SONG_REQUEST_POLICY_CLOSED` (403), `SONG_REQUEST_COOLDOWN` (429), `MAX_PENDING_PER_USER_REACHED` (409), `QUEUE_FULL` (409), `NO_VETO_OPEN` (422), `NO_ALTERNATE_FOR_VETO` (422), `VETO_WINDOW_CLOSED` (409), `RATE_LIMITED` (429), `WEBHOOK_DELIVERY_DEFERRED` (503)

### `GET /api/embed/rooms/:roomSlug` · `GET .../embed/rooms/:roomSlug/snapshot`
- **Purpose:** Read-only embeddable view + state snapshot (current track, queue, veto status, command hints) (FR-112, FR-113).
- **Reads:** `rooms`, `queue_items`, `tracks`, `preplay_veto_windows`, `external_chat_music` (policy display)
- **Writes:** —
- **Emits:** read-only `WS-S2C` subscription (no mutation)
- **Security:** **`SEC-EXTINTEG`**; `SEC-CSP` dynamic `frame-ancestors` per integration (§19.6.4), `SEC-CORS` per-integration origins, `SEC-FRAME`; **no secrets in URL/JS/storage/snapshot** (§19.6.4)
- **Tier:** N/A (public embed; display-only, FR-114)
- **Rate limit:** per-origin/integration read control
- **Acceptance:** `AC-EXT-3`, `AC-STAFF-7`
- **Errors:** `ROOM_NOT_FOUND` (404); disallowed origin → CSP/CORS rejection (logged, §19.6.2)

---

## WebSocket event surface (§16) — events as first-class endpoints

Client→server interactive events (`WS-C2S`) are gated by minimum tier `member` (`SEC-TIER`); listeners may only subscribe to read-only server→client events.

| Event (direction) | Family | Reads/Writes | Tier | Errors |
| --- | --- | --- | --- | --- |
| `chat.send` (C2S) | `WS-CHAT` | W `chat_messages`; Redis rate (5/10s) | `member` | `LISTENER_READ_ONLY`, `MUTED`, `CHAT_LOCKED`, `RATE_LIMITED` |
| `chat.message`/`chat.deleted` (S2C) | `WS-CHAT` | — | — | — |
| `playback.clientState` (C2S) | `WS-PLAYBACK` | R/W `queue_items` (advance signal) | server-trusted | — |
| `playback.skipVote` (C2S) | `WS-PLAYBACK` | W `skip_votes` | `member` | `VOTE_NOT_ALLOWED` |
| `playback.state`/`playback.resync` (S2C) | `WS-PLAYBACK` | R `queue_items` | — | — |
| `presence.heartbeat` (C2S) | WS-PRESENCE | W `room_sessions` (lastSeenAt), W Redis ZSET, sweeps expired | `listener`+ | — |
| `presence.updated` (S2C) | WS-PRESENCE | R `room_sessions` active list | — | — |
| `queue.*` (S2C) | `WS-QUEUE` | R `queue_items`/`queue_votes`/veto tables | — | — |
| `moderation.action` (C2S) | `WS-MOD` | W `room_moderation_actions`,`room_sessions` | `mod`/`host` | `MODERATOR_REQUIRED`,`HOST_REQUIRED` |
| `moderation.applied` (S2C) | `WS-MOD` | — | — | — |
| `integration.command.*` / `external.bot_message.created` / `room.external_settings.changed` (S2C) | `WS-INTEG` | R/W external tables | — | (errors surfaced via command result envelope, §23.2.3) |

**Connection (`WS-CONN`, §16.1):** token validated on connect; `WEBSOCKET_TOKEN_INVALID` (401) on failure; reconnection uses exponential backoff + jitter (§16.1.1, NFR-022); token refresh/rehydration via room bootstrap endpoint `POST /api/rooms/:roomId/listen`. Stale sessions are cleaned up, and active connections are synced to the presence list, avoiding duplicate rows on reconnect. WS errors must **not** disconnect the client unless auth/authorization/protocol-abuse/unrecoverable degradation (§23.2.2).

---

## Cross-cutting matrix — endpoints by table written (reverse lookup)

| Table (`DATA-*`) | Written by |
| --- | --- |
| `rooms` (`DATA-ROOMS`) | `POST /rooms`, `PATCH /rooms/:id/settings`, `site-command` (`!music`) |
| `room_sessions` (`DATA-SESSIONS`) | `/listen`, `/join`, `/password/verify`, `/nickname/change`, moderation/* |
| `nickname_claims` (`DATA-NICKNAMES`) | `/nicknames/protect`, `/join` (new claim) |
| `queue_items` (`DATA-QUEUE`) | `POST/DELETE /queue/items`, `/approve`/`/reject`, `/playback/skip`, `site-command` (`!sr`/`!rm`/advance) |
| `queue_votes` (`DATA-VOTES`) | `/queue/items/:id/vote` |
| `skip_votes` (`DATA-SKIPVOTES`) | `/playback/skip-vote` |
| `chat_messages` (`DATA-CHAT`) | WS `chat.send`, `DELETE /chat/messages/:id`, system messages |
| `room_moderation_actions` (`DATA-MODACTIONS`) | moderation/*, `/playback/skip`, `DELETE /queue/items`, `site-command` (`!skip`/mute) |
| `room_settings_history` (`DATA-SETTINGSHIST`) | `PATCH /rooms/:id/settings`, `site-command` (settings) |
| `site_integrations` (`DATA-INTEGRATIONS`) | `POST/PATCH/DELETE /integrations/site` |
| `external_participants` (`DATA-EXTPART`) | `site-command` (identity map, mute/unmute) |
| `external_commands` (`DATA-EXTCMD`) | `site-command` (always — audit + idempotency) |
| `external_references` (`DATA-EXTREF`) | `site-command` (`!sr` ref minting) |
| `preplay_veto_votes` / `preplay_veto_windows` | `site-command` (`!yay`/`!nay`), server window open/close |
| Redis (rate / presence / idempotency) | `/authenticate`, `/join`, `chat.send`, `site-command`, presence |
