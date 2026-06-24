# trackstacc-change-impact-matrix.md

> **Engineering Knowledge-Graph Layer — Deliverable 6 of 7**
> Answers: _"If this changes, what else must be reviewed?"_ One entry per major subsystem, listing the blast radius across requirements, components, data, APIs, WebSocket events, security controls, acceptance criteria, observability, and decisions.
> Derived from the cross-reference maps (`trackstacc-ai-documentation-plan.md` §4), the requirements graph (Deliverable 1), feature maps (Deliverable 2), the integration matrix (Deliverable 3), the dependency graph (Deliverable 4), and the security matrix (Deliverable 5). Each "Review" list is a **pre-merge checklist**, not a summary.

**How to use:** find the subsystem you are changing, then walk every line in its **Review** block. Lines marked ★ are hard constraints — changing them requires re-validating an invariant, not just updating code. Authority anchors: `SEC-EXTINTEG` (§19.5) and `ERR-REGISTRY` (§23.4) are canonical; `SEC-TIER` (NFR-038 + FR-028) must never weaken.

---

## CI-01 — Nickname Protection / Access Tier (`FEAT-NICKPROT`, `SEC-001`/`SEC-TIER`)

**Trigger examples:** changing the tier gate, the protect-and-join flow, token tier encoding, or what counts as an interactive action.

**Review:**

- ★ **Invariant `SEC-001`/`SEC-TIER`** — tier re-derived server-side on **every** REST request and WS event; verify it still cannot be bypassed by client manipulation (NFR-038, FR-028, `AC-V140-5`).
- **Requirements:** FR-010, FR-019, FR-028, FR-029, FR-071, FR-078 (re-read all).
- **Components:** Identity Service (§13.3), Auth Middleware, Frontend Client (gated-control prompts), and every service that performs a native mutation (Chat, Queue, Moderation, Playback).
- **Data:** `DATA-SESSIONS` (`room_sessions.access_tier`, in-place upgrade), `DATA-NICKNAMES` (`nickname_claims`).
- **APIs:** `API-NICK` `/listen`, `/join`, `/nicknames/{check,protect,authenticate}`, `/nickname/change` — plus **every** `POST /rooms/:id/*` mutating route (the gate is global).
- **WebSockets:** all `WS-C2S` interactive events (minimum tier check).
- **Security:** `SEC-001`, `SEC-002`, `SEC-004` (Argon2id), `SEC-006` (password rate limit).
- **Errors (§23.4):** `NICKNAME_PROTECTION_REQUIRED`, `LISTENER_READ_ONLY`, `NICKNAME_TAKEN`, `NICKNAME_PASSWORD_INCORRECT`, `NICKNAME_PASSWORD_RATE_LIMITED` — confirm registry still consistent (note the `NICKNAME_REQUIRED` vs `NICKNAME_PROTECTION_REQUIRED` open item, plan §1.4).
- **Acceptance:** `AC-V140-1`…`AC-V140-8`, `AC-JOIN-1`…`AC-JOIN-4`, `AC-CHAT-2`.
- **Observability:** nickname protection rate, failed password attempts (§24.1 #10/#11); brute-force alert (§24.3 #8).
- **Decisions:** DL-019 (mandatory protection), DL-020 (listener chat default), DL-001 (global nicknames), DL-009 (10-char password).
- **Cross-impact:** touches CI-04 (Chat — listener visibility), CI-08 (Room Creation — host must be protected), CI-03 (Queue — member gate).

---

## CI-02 — Playback Synchronization (`FEAT-PLAYBACK`, `SYNC`)

**Trigger examples:** changing the server time model, resync cadence, advance logic, or skip handling.

**Review:**

- ★ **Sync target ≤3s** (NFR-003, DL-010) — re-run resync integration test.
- ★ **Server-authoritative advance** (§12) — server, not client, decides current track.
- **Requirements:** FR-040–046; interacts with FR-130–143 (veto opens before playback start) and FR-044 (auto-advance).
- **Components:** Playback Coordinator (§13.5), Queue Engine (next item), Socket.IO Gateway.
- **Data:** `DATA-QUEUE` (`queue_items` state/started_at/ended_at), `DATA-SKIPVOTES`.
- **APIs:** `/playback/skip`, `/playback/skip-vote`.
- **WebSockets:** `WS-PLAYBACK` `playback.state`, `playback.resync`, `playback.clientState`, `playback.skipVote`; `room.snapshot` on connect.
- **Security:** `SEC-002` (force-skip authz), `SEC-024` (player-failure degradation).
- **Errors:** `TRACK_NOT_FOUND`, `VIDEO_UNAVAILABLE`.
- **Acceptance:** `AC-PLAY-1`…`AC-PLAY-4`; re-check `AC-VETO-1`/`AC-VETO-6` (veto-window-before-start coupling).
- **Observability:** playback error rate (§24.1 #8); high-playback-failure alert (§24.3 #6).
- **Decisions:** DL-010 (3s sync), DL-014 (play last candidate on veto exhaustion); LIM-004 (drift accepted).
- **Cross-impact:** CI-05 (Veto — window opens on the pre-play boundary), CI-03 (Queue — advance selection), CI-10 (YouTube — embed failures mark/skip).

---

## CI-03 — Queue & Selection (`FEAT-QUEUE`, `FEAT-MECHANICS`, `ALGO`)

**Trigger examples:** changing add-song validation, dedup/duration rules, mechanic selection, or vote scoring.

**Review:**

- **Requirements:** FR-030–037 (input), FR-050–060 (mechanics), FR-082/087 (mod removal/lock).
- **Components:** Queue Engine (§13.4), YouTube Metadata Service (§13.8), Rate Limit Service, Playback Coordinator (advance), Chat Service (mechanic-change system message).
- **Data:** `DATA-QUEUE` (`queue_items` position/score/state), `DATA-VOTES`, `DATA-TRACKS` (`metadata_status`), `DATA-ROOMS` (`playlist_mechanic`, limits), `DATA-SETTINGSHIST`.
- **APIs:** `POST/DELETE /queue/items[/:id]`, `/vote`, `/approve`, `/reject`; `PATCH /rooms/:id/settings` (mechanic change).
- **WebSockets:** `WS-QUEUE` `queue.item.added/removed`, `queue.updated`, `queue.vote.updated`; `room.mechanic.changed`.
- **Security:** `SEC-002`, `SEC-006` (add-song cooldown 30s), `SEC-009` (YouTube key server-side).
- **Errors:** `VIDEO_URL_INVALID`, `VIDEO_UNAVAILABLE`, `VIDEO_TOO_LONG`, `DUPLICATE_VIDEO`, `QUEUE_LOCKED`, `QUEUE_FULL`, `MECHANIC_CHANGE_COOLDOWN`, `YOUTUBE_METADATA_DEGRADED`.
- **Acceptance:** `AC-QUEUE-1`…`AC-QUEUE-4`, `AC-MECH-1`…`AC-MECH-6`.
- **Observability:** queue additions/min, YouTube quota/metadata failure (§24.1 #5/#6/#7).
- **Decisions:** DL-006 (upvote-only MVP), DL-007 (host-curated suggestions), DL-014.
- **Cross-impact:** CI-02 (Playback advance), CI-05 (Veto needs an alternate candidate), CI-10 (YouTube), CI-07 (SR policy governs external adds).

---

## CI-04 — Chat (`FEAT-CHAT`)

**Trigger examples:** changing send path, history pagination, listener-visibility, sanitization, or realtime channel routing.

**Review:**

- ★ **Listener read controlled by `listener_chat_visible`, default hidden** (FR-078, DL-020) — re-test both states (`AC-CHAT-2`, `AC-V140-6`).
- ★ **Chat channel routing invariant** — `chat.message` and `chat.deleted` must be broadcast to `room:${roomId}:chat` sub-channel, never the global `room:${roomId}` channel. Realtime delivery and REST chat history must share the same listener privacy boundary (`broadcast.ts` routing, `gateway.ts` connection-time gating, `rooms.router.ts` settings-toggle sync).
- **Requirements:** FR-070–078.
- **Components:** Chat Service (§13.6), Rate Limit Service, Moderation Service (delete/mute/lock), `broadcast.ts`, `gateway.ts` (connection-time channel join), `rooms.router.ts` (settings-toggle dynamic sync).
- **Data:** `DATA-CHAT` (`chat_messages`, `deleted_at`), `DATA-ROOMS` (`listener_chat_visible`), `DATA-SESSIONS` (`is_muted`).
- **APIs:** `GET /chat/messages` (cursor pagination, cap 100 DL-004), `DELETE /chat/messages/:id`.
- **WebSockets:** `WS-CHAT` `chat.send`, `chat.message`, `chat.deleted`.
- **Security:** `SEC-001` (member to send), `SEC-006` (5 msg/10s), `SEC-007` (sanitization/XSS), `SEC-011` (mute/lock).
- **Errors:** `LISTENER_READ_ONLY`, `MUTED`, `CHAT_LOCKED`, `RATE_LIMITED`, `CHAT_MESSAGE_NOT_FOUND`.
- **Acceptance:** `AC-CHAT-1`…`AC-CHAT-5`.
- **Observability:** messages/sec, rate-limit triggers (§24.1 #4/#13).
- **Decisions:** DL-004 (100-message history), DL-020.
- **Cross-impact:** CI-01 (tier gate on send), CI-06 (moderation deletes/locks).

---

## CI-05 — Pre-Play Veto (`FEAT-VETO`, `MECH`, `ALGO` §17.6)

**Trigger examples:** changing threshold modes, vote counting, window timing, or the advance-on-veto cycle.

**Review:**

- ★ **Opens only before playback and only with ≥1 alternate** (FR-131, FR-132, FR-133) — re-test no-alternate path (`AC-VETO-1`, `NO_ALTERNATE_FOR_VETO`).
- ★ **Net nays = nayCount − yayCount; vetoed at threshold** (FR-138, FR-139) — re-test hybrid default (25% / min 3 net nays, App. A).
- ★ **Play last candidate on exhaustion** (DL-014) — re-test advance cycle (§17.6).
- **Requirements:** FR-130–143; FR-174 (one vote per external user).
- **Components:** Queue Engine (veto logic), Playback Coordinator, External Command Service (vote ingress).
- **Data:** `DATA-VETOVOTES` (`preplay_veto_votes`, one active vote/candidate/voter), `DATA-VETOWIN` (`preplay_veto_windows`, status + threshold snapshot), `DATA-QUEUE`.
- **APIs:** `POST /integrations/site-command` (`!yay`/`!nay`).
- **WebSockets:** `WS-QUEUE` `queue.item.veto_window.opened/.updated`, `queue.item.vetoed`, `queue.item.veto_passed`; `WS-PLAYBACK` `playback.state`.
- **Security:** `SEC-018` (stable-identity vote integrity), `SEC-014`–`SEC-016` (command auth/replay/idempotency) — **defer to `SEC-EXTINTEG` §19.5**.
- **Errors:** `NO_VETO_OPEN`, `NO_ALTERNATE_FOR_VETO`, `VETO_WINDOW_CLOSED`, `VOTE_NOT_ALLOWED`.
- **Acceptance:** `AC-VETO-1`…`AC-VETO-7`.
- **Observability:** veto windows opened/passed/vetoed, vote volume/rejections (§24.1 #16/#17); veto-abuse alert (§24.3 #11).
- **Decisions:** DL-013 (requester votes allowed), DL-014.
- **Cross-impact:** CI-02 (Playback boundary), CI-03 (alternate candidate), CI-07 (external command path), CI-09 (external mute blocks `!yay`/`!nay`).

---

## CI-06 — Moderation (native) (`FEAT-MOD`, `MOD-NATIVE`)

**Trigger examples:** changing mute/ban semantics, role assignment, audit format, or realtime broadcast behavior.

**Review:**

- ★ **Server-side role check on every write; audit required** (`SEC-002`, `SEC-010`, NFR-067).
- ★ **Moderation hierarchy** — self-moderation blocked; moderator cannot moderate host or another moderator (`assertModerationHierarchy` in `moderation.service.ts`). Changing hierarchy rules must re-validate all role checks.
- ★ **Ban side effects** — immediate socket disconnect by `targetSessionId` (`socket.disconnect(true)`), Redis presence eviction (`evictSessionPresence`), WebSocket connection validation rejects banned sessions (`session.isBanned` in `gateway.ts`), same-room rejoin via `POST /api/rooms/:roomId/join` blocked (`assertNicknameNotBannedInRoom` throws `BANNED`). Any change to ban behavior must re-verify disconnect, reconnect rejection, and rejoin prevention.
- **Requirements:** FR-080–088, FR-075–076.
- **Components:** Moderation Service (§13.7), Presence Manager (`evictSessionPresence`, `getParticipants`), Socket.IO Gateway (banned session WS auth), Identity Service (`assertNicknameNotBannedInRoom`), Chat, Queue, Playback.
- **Data:** `DATA-MODACTIONS`, `DATA-SESSIONS` (`is_muted`/`is_banned`/`left_at`/role), Redis presence ZSET, `DATA-CHAT`, `DATA-QUEUE`.
- **APIs:** `POST /rooms/:id/moderation/{mute,unmute,ban,unban}`, `DELETE /chat/messages/:id`, `DELETE /queue/items/:id`, `/playback/skip`, `POST /rooms/:id/join` (banned rejoin rejection).
- **WebSockets:** `WS-MOD` `moderation.action`, `moderation.applied` (broadcast to all room participants); `WS-PRESENCE` `presence.updated` (broadcast after every action — muted targets carry `isMuted` flag, banned targets omitted).
- **Security:** `SEC-002`, `SEC-008` (WS token validation rejects banned), `SEC-010`, `SEC-011`.
- **Errors:** `MODERATOR_REQUIRED`, `HOST_REQUIRED`, `FORBIDDEN` (hierarchy), `BANNED`, `MUTED`, `CHAT_LOCKED`, `QUEUE_LOCKED`.
- **Acceptance:** `AC-CHAT-3`, `AC-CHAT-4`, Issue #83 moderation test suite (`tier-gate-rest.test.ts`, `realtime.test.ts`).
- **Observability:** moderation actions (§24.1 #12); socket disconnect events.
- **Decisions:** —.
- **Cross-impact:** CI-04 (chat delete/lock), CI-03 (item removal), CI-01 (banned session rejoin blocked at join), CI-08 (banned user cannot rejoin same room), CI-09 (external muting is a separate but parallel path).

---

## CI-07 — External Command Bridge / Integration (`FEAT-EXTCMD`, `SEC-EXTINTEG`)

**Trigger examples:** changing inbound auth, idempotency, command parsing, rate limits, or outbound webhook delivery.

**Review:**

- ★★ **All changes governed by `SEC-EXTINTEG` (§19.5, authoritative)** — never weaken HMAC/bearer auth, timestamp freshness, replay protection, idempotency, schema validation, multi-level rate limits, sanitization, signed outbound (defense-in-depth items 1–13).
- ★ **Embeds are display-only; no privileged mutation without server-side identity** (FR-114).
- **Requirements:** FR-110–119, FR-150–168, FR-170–179.
- **Components:** External Command Service (§13.11), Outbound Bot Webhook Service (§13.12), Rate Limit Service; fans out to Queue Engine / Playback / Moderation.
- **Data:** `DATA-INTEGRATIONS`, `DATA-EXTPART`, `DATA-EXTCMD` (idempotency), `DATA-EXTREF`, `DATA-EXTCONFIG` (`external_chat_music` JSONB).
- **APIs:** `POST /integrations/site` (+PATCH/DELETE), `POST /integrations/site-command`, `GET /embed/rooms/:slug[/snapshot]`.
- **WebSockets:** `WS-INTEG` `integration.command.received/accepted/rejected`, `external.bot_message.created`, `room.external_settings.changed`.
- **Security:** `SEC-014`–`SEC-024` (entire external cluster), `SEC-012`/`SEC-013` (embed CSP/CORS), `SEC-019` (secret separation), `SEC-022` (signed webhooks).
- **Errors:** `INTEGRATION_AUTH_INVALID`, `EXTERNAL_COMMAND_REPLAY`, `EXTERNAL_COMMAND_DUPLICATE`, `INVALID_COMMAND_SYNTAX`, `RATE_LIMITED`, `WEBHOOK_DELIVERY_DEFERRED`.
- **Acceptance:** `AC-EXT-1`…`AC-EXT-8`, `AC-STAFF-6`, `AC-STAFF-7`.
- **Observability:** external command volume/rejection rate, webhook failures/retries, integration abuse triggers (§24.1 #14/#15/#18/#19); alerts §24.3 #9/#10.
- **Decisions:** DL-011, DL-012 (per-integration-per-room scope), DL-015, DL-017 (webhook retry/DLQ), DL-018 (unique prefix).
- ★ **Webhook non-transactional rule (§23.6, DL-017):** webhook failure must never roll back accepted room state.
- **Cross-impact:** CI-05 (veto votes), CI-07→CI-08/CI-09 (staff & mute sub-paths), CI-10 (embed CSP touches frontend infra).

---

## CI-08 — External Staff Commands & Song-Request Policy (`FEAT-EXTSTAFF`, `FEAT-SRPOLICY`)

**Trigger examples:** changing staff authorization, command set (`!rm`/`!skip`/`!music`), or policy modes.

**Review:**

- ★ **Staff authorized server-side via allowlist / trusted role mapping; no client trust** (`SEC-017`, §19.5) — and failure reasons must not leak allowlists/secrets (§23.5 #3).
- **Requirements:** FR-150–162.
- **Components:** External Command Service, Moderation Service, Queue Engine, Playback Coordinator, Room Service.
- **Data:** `DATA-INTEGRATIONS` (staff map), `DATA-EXTCMD`, `DATA-QUEUE`, `DATA-EXTREF`, `DATA-ROOMS`/`DATA-EXTCONFIG`, `DATA-SETTINGSHIST`, `DATA-MODACTIONS`.
- **APIs:** `POST /integrations/site-command` (`!rm`, `!skip`, `!music ...`).
- **WebSockets:** `WS-QUEUE` `queue.item.removed`; `WS-PLAYBACK` `playback.state`; `WS-INTEG` `room.external_settings.changed`, `external.bot_message.created`.
- **Security:** `SEC-017`, `SEC-010` (audit accepted+rejected), `SEC-020` (command rate limits) — under `SEC-EXTINTEG`.
- **Errors:** `EXTERNAL_COMMAND_UNAUTHORIZED`, `EXTERNAL_ROLE_UNTRUSTED`, `QUEUE_ITEM_NOT_FOUND`, `SONG_REQUEST_POLICY_CLOSED`, `SONG_REQUEST_COOLDOWN`, `MAX_PENDING_PER_USER_REACHED`.
- **Acceptance:** `AC-STAFF-1`…`AC-STAFF-5`, `AC-EXT-6`.
- **Observability:** staff command volume / settings changes (§24.1 #20); staff-anomaly alert (§24.3 #12).
- **Decisions:** DL-016 (Phase-2 staff confirmation); note SR-policy enum discrepancy (plan §1.4).
- **Cross-impact:** CI-07 (parent bridge), CI-03 (queue mutations), CI-02 (force-skip), CI-05 (veto/SR settings).

---

## CI-09 — External Participant Muting (`FEAT-EXTMUTE`, `MOD-EXTMUTE`)

**Trigger examples:** changing mute duration parsing, auto-expiry, or which commands a mute blocks.

**Review:**

- ★ **Muted users keep `!song`/`!queue` but are blocked from `!sr`/`!yay`/`!nay`** (FR-168) — re-test boundary.
- ★ **Auto-expiry via lazy check on next command + periodic cleanup** (FR-165, §10.18, §20.3) — re-test TTL race.
- **Requirements:** FR-163–168.
- **Components:** External Command Service, Moderation Service.
- **Data:** `DATA-EXTPART` (mute flag/expiry/reason), `DATA-MODACTIONS`.
- **APIs:** `POST /integrations/site-command` (`!music mute/unmute`).
- **WebSockets:** `WS-INTEG` `external.bot_message.created`.
- **Security:** `SEC-017` (staff authz), `SEC-010` (audit), `SEC-020` (rate limit) — under `SEC-EXTINTEG`.
- **Errors:** `EXTERNAL_USER_MUTED`.
- **Acceptance:** `AC-STAFF-8`…`AC-STAFF-11`.
- **Observability:** mute/unmute actions + active mute counts (§24.1 #21).
- **Decisions:** —.
- **Cross-impact:** CI-05 (blocks veto votes), CI-07 (command path), CI-08 (staff issues the mute).

---

## CI-10 — YouTube Integration & Frontend/Embed Infra (`YT`, `FEAT-EMBED`)

**Trigger examples:** changing metadata fetching, the embedded player, CSP, or embed rendering.

**Review:**

- ★ **YouTube API key server-side only** (`SEC-009`); ★ **embed carries no secrets** (`SEC-019`, §19.6.4).
- ★ **Dynamic embed CSP `frame-ancestors` per integration** (`SEC-012`, §19.6.4); do not send `X-Frame-Options` on embeds (§19.6.5).
- **Requirements:** FR-030–037 (metadata), FR-040/046 (player failure), FR-110–114 (embed), NFR-050–053 (compliance), NFR-004 (LCP), NFR-037 (CSP).
- **Components:** YouTube Metadata Service (§13.8), Frontend Client (§13.1), Embeddable Room Client (§13.10).
- **Data:** `DATA-TRACKS` (`metadata_status`), read-only snapshot of `DATA-ROOMS`/`DATA-QUEUE`/`DATA-VETOWIN`.
- **APIs:** `POST /queue/items` (metadata), `GET /embed/rooms/:slug[/snapshot]`.
- **WebSockets:** read-only `WS-S2C` for embeds; `WS-PLAYBACK` for player.
- **Security:** `SEC-009`, `SEC-012`, `SEC-013`, `SEC-019`, `SEC-024` (YouTube breaker).
- **Errors:** `YOUTUBE_METADATA_DEGRADED`, `VIDEO_UNAVAILABLE`, `ROOM_NOT_FOUND`.
- **Acceptance:** `AC-QUEUE-1`…`AC-QUEUE-3`, `AC-PLAY-4`, `AC-EXT-3`, `AC-STAFF-7`.
- **Observability:** YouTube quota usage, metadata failure rate, playback error rate (§24.1 #6/#7/#8); LCP (NFR-004); YouTube-quota alert (§24.3 #5).
- **Decisions:** default embed mode `player_and_queue_readonly` (App. A); embedMode enum discrepancy (plan §1.4).
- **Cross-impact:** CI-02 (player failure → skip), CI-03 (metadata gating), CI-07 (embed is the integration surface).

---

## CI-11 — Infrastructure & Resilience (Redis / PostgreSQL / breakers) (`DEPLOY`, `ERR-CIRCUIT`)

**Trigger examples:** changing rate-limit backing, presence store, breaker thresholds, or degradation rules.

**Review:**

- ★ **PostgreSQL is the source of truth; cache must never become authoritative** (§23.6.2 #3).
- ★ **Redis-down → abuse-sensitive writes fail closed** (external SR/votes, staff cmds, password attempts, room-creation bursts, public-room queue writes) (§23.6.2 #2).
- ★ **Webhook failure never rolls back accepted state** (§23.6.2 #4).
- **Requirements:** NFR-020, NFR-021, NFR-022, NFR-023; NFR-035/063 (rate limits).
- **Components:** Rate Limit Service, Presence Manager, Socket.IO Gateway, all PG-backed services.
- **Data:** Redis (rate/presence/idempotency), PostgreSQL (all durable tables).
- **APIs:** affects every endpoint's failure mode; `/health`, `/health/ready` semantics (§23.6.2 #5).
- **WebSockets:** reconnection backoff (§16.1.1, NFR-022).
- **Security:** `SEC-006`, `SEC-020`, `SEC-024` (fail-closed is a security property here).
- **Errors:** `DEPENDENCY_UNAVAILABLE`, `SERVICE_DEGRADED`, `YOUTUBE_METADATA_DEGRADED`, `WEBHOOK_DELIVERY_DEFERRED`.
- **Acceptance:** `AC-P1-4` (breaker behavior specified).
- **Observability:** DB latency, Redis unavailability, uptime alerts (§24.3 #3/#4); breaker transitions emit logs+metrics (§23.6.1).
- **Decisions:** DL-010 (sync), DL-017 (webhook DLQ); TD items in §38.
- **Cross-impact:** **everything** — this is the substrate; a breaker/threshold change is reviewed against every CI entry above.

---

## Quick blast-radius lookup

| If you change…                      | Start at | Also review                       |
| ----------------------------------- | -------- | --------------------------------- |
| Tier gate / protect-and-join        | CI-01    | CI-03, CI-04, CI-06, CI-08        |
| Sync / advance / skip               | CI-02    | CI-03, CI-05, CI-10               |
| Add-song / mechanic / vote          | CI-03    | CI-02, CI-05, CI-07, CI-10        |
| Chat send / visibility              | CI-04    | CI-01, CI-06                      |
| Veto threshold / window             | CI-05    | CI-02, CI-03, CI-07, CI-09        |
| Native moderation                   | CI-06    | CI-03, CI-04                      |
| External command auth / idempotency | CI-07    | CI-05, CI-08, CI-09, CI-10, CI-11 |
| Staff commands / SR policy          | CI-08    | CI-07, CI-02, CI-03               |
| External muting                     | CI-09    | CI-05, CI-07, CI-08               |
| YouTube / embed / CSP               | CI-10    | CI-02, CI-03, CI-07               |
| Redis / PG / breakers               | CI-11    | all                               |
