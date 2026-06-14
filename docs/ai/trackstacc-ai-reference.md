# trackstacc-ai-reference.md

**Compressed full-system reference for the Trackstacc SDD (v1.4.0).** ~10% of the source. Preserves all critical requirements, decisions, constraints, and behaviors while minimizing tokens. For navigation use `trackstacc-ai-index.md`; for stable IDs, cross-reference maps, and retrieval strategy use `trackstacc-ai-documentation-plan.md`. Source IDs (`FR-*`, `NFR-*`, `DL-*`, `LIM-*`, `TD-*`) are verbatim.

---

## System Summary

**Product purpose.** `trackstacc.live` is a no-registration, real-time collaborative YouTube listening-room web app. Users create/join rooms with shared playback, a collaborative queue, chat, and configurable playlist mechanics. v1.1+ adds read-only external embeds and a server-to-server external chat command bridge; v1.4.0 makes a password-protected nickname mandatory for native interactive participation.

**Defining constraint — no traditional registration.** No email, OAuth, or accounts. On the native site anyone may **open a room to listen and view the playlist for free** (the read-only **Listener** tier). To **chat, vote, add songs, react, or moderate**, a user must hold a **password-protected nickname** (the `member` tier) — a nickname plus a password, never an email. The system never assigns generic names like `guest_1234`.

**Architectural style.** Real-time web app with **authoritative server-side room state**. Thin Fastify HTTP handlers + Socket.IO realtime delegate to in-process domain services; PostgreSQL is the source of truth; Redis backs presence, rate limits, pub/sub. Clients are authoritative only for local UI and local YouTube player events (treated as signals).

**Major constraints.** YouTube embed/IFrame playback only — no download/proxy/cache/re-stream of audiovisual content (NFR-050–053). Playback sync is approximate (1–3s, DL-010). No password recovery in MVP (LIM-001). The native protection rule applies **only to the native site**; embeds remain read-only and use the server-to-server external-identity model. All writes authorized server-side (NFR-033).

**Key product decisions.** Free listening; protected-nickname participation (DL-019); listener chat hidden by default (DL-020); global nicknames (DL-001); host authority via link/session in MVP, nickname-bound in Phase 2 (DL-002); 10-char minimum password (DL-009); external integration is an MVP should-have, native-first (DL-011); read-only embeds with all mutations via the command bridge.

---

## Domain Model Summary

- **Rooms** (`rooms`): shared real-time space with chat, playback, queue, settings, visibility (`private_link`/`public`/`password_protected`), `host_secret_hash`, `playlist_mechanic`, duplicate policy, skip-vote threshold, `queue_locked`, `chat_locked`, `listener_chat_visible` (default FALSE, FR-078), and `external_chat_music` (JSONB). Temporary rooms expire after 14 days inactivity (DL-003).
- **Nicknames** (`nickname_claims`): **global** protected nicknames keyed by `normalized_nickname` (unique where active); store `password_hash` (Argon2id), `display_nickname`, `status` (active/locked/released). Normalization: trim, case-fold (NFKC), reject confusables/control chars, length 2–24; reserved names blocked (admin, system, moderator, host, youtube, support — DL-008).
- **Listeners** (`room_sessions` with `access_tier=listener`): in-room users with no nickname and no password hash; read-only (hear playback, view playlist; read chat only if `listener_chat_visible`). May upgrade in place to `member`.
- **Participants / members** (`room_sessions` with `access_tier=member`): authenticated against a protected nickname (`nickname_claim_id` required); roles `participant`/`moderator`/`host` require member tier. `member` requires non-null nickname columns (CHECK + app-layer). Unique active nickname per room enforced for members only.
- **Moderators / Host**: delegated/owning authority; both must be members to act. A host who hasn't authenticated is a Listener of their own room.
- **External participants** (`external_participants`): pseudonymous identity mapping per `(integration_id, room_id, external_user_id)` (DL-012); `moderation_status` (active/muted/banned/limited) with `muted_until`/`muted_at`/`muted_by`.
- **Playlist entities**: `tracks` (cached YouTube metadata, unique `(provider, provider_video_id)`); `queue_items` (state machine: `suggested→queued→playing→played|skipped|removed|failed|rejected|vetoed`, position, score, `mechanic_context` JSONB); `queue_votes` (upvote-only MVP, DL-006); `skip_votes` (live skip).
- **Playback entities**: authoritative playback state per room (`queueItemId`, `videoId`, `status` playing/paused/buffering/ended/stopped, `startedAt`, `serverPositionSeconds`). Veto entities: `preplay_veto_windows` (status open/vetoed/passed/expired + threshold snapshot + result) and `preplay_veto_votes` (one active vote per candidate per voter). External: `external_commands` (audit + idempotency on `(integration_id, channel_id, external_message_id)`), `external_references` (short refs like `[K7Q]`).

---

## Permission Model Summary

**Native (§9.2.1):** every interactive capability requires `member`. Listeners can only open/hear playback, view playlist/queue, read chat (configurable, default No), and upgrade. Members can chat, vote, skip-vote, add song (configurable), react (Phase 2). Force skip, delete chat, mute/ban, change mechanic/settings require Moderator/Host. A Listener attempting any "No" action gets an **upgrade prompt** (FR-029), not a generic denial. Enforced server-side on every REST request and WS event via tier encoded in the signed token (NFR-038, FR-028).

**External (§9.2.2):** capabilities derive from integration config, song-request policy, moderation state, and rate limits — **never** from a native protected nickname and never from browser-provided role/session/identity. Read-only commands (`!song`/`!np`/`!queue`/help) for all; `!sr` and `!yay`/`!nay` subject to policy, eligibility, and mute state; staff commands only via configured external user ID allowlist or trusted role mapping, authorized server-side on every command. Integration Bot posts signed outbound announcements only and cannot initiate privileged writes.

---

## Architecture Summary

- **Frontend:** Next.js 14 + React 18 + TypeScript + Tailwind. Tier-aware room UI; read-only experience + inline upgrade prompts for Listeners; YouTube IFrame player; Socket.IO client with token upgrade on Listener→member. Key routes: `/`, `/rooms/:slug`, `/rooms/:slug/join`, `/terms`, `/privacy`.
- **Backend:** **Fastify 5 + TypeScript** (final decision; NestJS no longer an option) with thin handlers delegating to domain services (Room, Identity/Nickname, Queue Engine, Playback Coordinator, Chat, Moderation, Rate Limit, External Command, Outbound Webhook, YouTube Metadata). Services must not depend on Fastify req/reply; REST and Socket.IO share authz/validation/rate-limit/error utilities. Zod validation; Argon2id hashing. In-process synchronous service calls; event bus deferred.
- **Database:** PostgreSQL 16 via Prisma (root schema `prisma/schema.prisma`). Prisma Migrate; expand-contract zero-downtime patterns; manual rollback scripts for high-risk migrations; CI applies `migrate deploy` to a disposable DB.
- **Realtime infrastructure:** Socket.IO with Redis adapter; Redis 7 (`ioredis`) for presence, rate limits, distributed room broadcasts. Reconnection: exponential backoff (1s base, 2×, ±25% jitter, 30s max, 10 retries), 25s heartbeat / 60s server timeout; `room.snapshot` on reconnect; `SESSION_INVALID` redirects to join.
- **External integrations:** read-only iframe embed + signed server-to-server command bridge. YouTube Data API (server-side metadata) + IFrame player (client playback). Outbound bot webhooks are signed side effects.
- **Deployment:** CDN/edge + single app deployable (REST + WS gateway + background workers) + managed PostgreSQL/Redis; Docker Compose / Coolify. Stateless API; Redis pub/sub for cross-instance; sticky WS sessions if needed; partition hot public rooms; split WS from REST when scale demands (TD-002).
- **DevOps:** pnpm workspaces + Turborepo + Corepack (pnpm 9.15.4, Node 20+); CI runs lint/typecheck/test/`pnpm audit`/`migrate deploy`; required env vars (`DATABASE_URL`, `REDIS_URL`, `YOUTUBE_API_KEY`, `SESSION_SECRET`, `HOST_SECRET_SALT`) fail-fast; frozen lockfile; local/CI/staging/prod parity.

---

## API Summary

Base path `/api/v1/`; additive changes don't bump version, breaking changes do. Cursor-based pagination (`limit`≤100, `before`/`after`), rate-limit headers (`X-RateLimit-*`, `Retry-After` on 429), request-id correlation (`X-Request-Id`). DB columns `snake_case`, payloads `camelCase`, WS events `dot.separated`, error codes `UPPER_SNAKE_CASE`.

- **Room** (`API-ROOMS`): `POST /rooms`, `GET /rooms/:id`, `PATCH /rooms/:id/settings`, `POST /rooms/:id/join` (handles host upgrade/activation via `host_token` cookie), `POST /rooms/:id/password/verify`.
- **Nickname & session** (`API-NICK`): `POST /nicknames/check|protect|authenticate`; `POST /rooms/:id/listen` → read-only listener session (no nickname; room password only if protected); `POST /rooms/:id/join` → member session via authenticate existing or claim new (protect-and-join), upgrades a supplied listener session in place; `POST /rooms/:id/nickname/change`. Join without a way to obtain a protected nickname → `409 NICKNAME_PROTECTION_REQUIRED`; interactive action on a listener session → `403 LISTENER_READ_ONLY`.
- **Queue** (`API-QUEUE`): `POST/DELETE /rooms/:id/queue/items[/:itemId]`, vote endpoint.
- **Chat** (`API-CHAT`): `GET /rooms/:id/chat/messages?before=`, `DELETE …/:messageId` (most chat flows over WS).
- **Moderation** (`API-MOD`): `mute|unmute|ban|unban|assign-moderator|revoke-moderator`.
- **External** (`API-INTEG`): integration CRUD `POST/PATCH/DELETE /rooms/:id/integrations/site`; `POST /integrations/site-command` (server-to-server, authenticated by integration secret not browser token); `GET /embed/rooms/:slug[/snapshot]`. Command payload includes integrationId, roomId, channelId, externalMessageId, externalUserId, displayName, roles, rawText, timestamp, signature/bearer, idempotencyKey; response carries status, resultCode, message, externalReference.

---

## WebSocket Summary

Connect with signed token; server validates signature, room, session, ban/mute, expiration. Every event re-derives tier from the token (NFR-038).

- **Client→server** (`WS-C2S`), with minimum tier: `chat.send` (member), `queue.add` (member), `queue.vote` (member), `playback.skipVote` (member), `room.settings.update` (host/mod), `room.mechanic.change` (host), `moderation.action` (host/mod); `playback.clientState` and `presence.heartbeat` allowed for `listener`. Member-only events on a listener connection → `error` ack `LISTENER_READ_ONLY`.
- **Server→client** (`WS-S2C`): `room.snapshot`, `presence.updated`, `chat.message`/`chat.deleted`, `queue.updated`/`queue.item.added`/`queue.item.removed`/`queue.vote.updated`, veto events `queue.item.veto_window.opened`/`.updated`/`queue.item.vetoed`/`queue.item.veto_passed`, `playback.state`/`playback.resync`, `room.settings.changed`/`room.mechanic.changed`/`room.external_settings.changed`, integration `integration.command.received`/`.accepted`/`.rejected`, `external.bot_message.created`, `moderation.applied`, `error`.

---

## Security Summary

**Threats (§19.1):** nickname impersonation/brute force, host secret leakage, chat/queue spam, XSS, unauthorized actions, WS forgery, public-room abuse, API key exposure, forged/replayed external commands, external role spoofing, vote manipulation via unstable identity, secret leakage via iframe/JS, and **Listener privilege escalation**.

**Controls.** Argon2id passwords (never stored/logged/returned as plaintext or hash). Signed httpOnly SameSite cookies + short-lived WS tokens encoding access tier; rotate on privilege escalation. **Native tier gate (`SEC-TIER`):** access tier is in the signed token and re-derived server-side on every request/event; interactive actions on listener sessions rejected (`LISTENER_READ_ONLY`/`NICKNAME_PROTECTION_REQUIRED`) regardless of client state (NFR-038, FR-028). Server-side authorization for every write (NFR-033). Output escaping + input sanitization + strict CSP for XSS.

**External integration security — §19.5 is the single authoritative source** (referenced by §12.4, §13.11, §20.3, §31.7, §31.9; it takes precedence over any reference copy): HMAC signature or bearer verification; timestamp freshness; idempotency by external message ID; replay protection; strict schema validation before parsing; per-integration/room/user/command rate limits; sanitization of raw text, display names, titles, bot messages, references; audit log for accepted+rejected privileged commands; signed outbound webhooks; **public embed token distinct from server-side integration secret**; origin allowlist; CSP `frame-ancestors` for registered origins; no privileged mutation callable from the embed without authenticated server-side identity.

**CORS/CSP (NFR-037):** deny-by-default with per-environment and per-integration allowlists. Separate allowlists for first-party web origins vs embed origins; credentials only for first-party; never `Allow-Origin: *` with credentials; minimal methods/headers; `Vary: Origin`. Native CSP is strict (`default-src 'self'`, nonce scripts, YouTube frame-src, no `unsafe-inline`/`unsafe-eval` in prod). Embed CSP is dynamic per-integration (`frame-ancestors {registered origins}`). No secrets/host secrets/room passwords/session IDs/staff assertions in iframe URLs, JS, storage, postMessage, or public snapshots. Headers: `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`, conservative COOP/CORP; CSP report-only in staging, enforced in prod.

---

## Moderation Summary

**Abuse scenarios (§20.1):** chat/queue flooding, long/offensive videos, impersonation, offensive nicknames, room-creation spam, vote manipulation via multiple sessions, forged/replayed/duplicate external commands, `!sr` flooding/queue stacking, coordinated veto abuse, staff role spoofing, embed origin copying, webhook abuse.

**Native controls (`MOD-NATIVE`, §20.2):** mandatory protected-nickname gate raises per-actor abuse cost; password strength + brute-force limits; chat/queue-add rate limits; max video duration; duplicate prevention; per-session vote limits; host/mod tools (mute, ban, delete message, remove item, force skip, lock queue/chat); public-room cooldowns; audit logs. Native moderation actions recorded in `room_moderation_actions`. Example rate limits: chat 5/10s, add-song 1/30s, nickname change 3/10min, failed nickname password 5/15min, create room 5/hr, mechanic change 1/5min (public).

**External controls (`MOD-EXT*`, §20.3, building on §19.5):** command-bridge (auth/freshness/idempotency/replay/per-scope rate limits/schema/sanitize/audit/signed webhooks); queue (`maxQueueSize`, `maxPendingPerUser`, per-user/per-room add limits, duration, duplicate, blocked video/channel IDs, optional quarantine); vote (one vote per stable external user per candidate, vote changes replace, no anonymous embed votes, eligibility rules, requester votes allowed unless abused — DL-013, optional trust signals — DL-015, identity from backend not browser); staff (allowlist + trusted role mapping, command rate limits, audit + announce every action, no client-side trust, mute/unmute rate-limited per actor/target, permanent mute needs explicit syntax — DL-016); embed (origin allowlist, token≠secret, no browser secrets, no privileged embed mutations).

**External mute lifecycle (`MOD-EXTMUTE`, FR-163–168):** `!music mute <@user|id> [duration]` sets `moderation_status=muted`, computes `muted_until` (or NULL for permanent), records `muted_at`/`muted_by`; blocks `!sr`/`!yay`/`!nay` but allows `!song`/`!queue`; audited + bot-announced. Duration: `<N>s/m/h/d` or `forever`/omit. `!music unmute` early-unmutes and clears mute fields. Auto-expiry checked **lazily** on the muted user's next command (or periodic cleanup), no timer infra, no announcement on auto-expiry.

---

## Operational Summary

- **Deployment:** CDN + single app server (REST + WS + workers) + managed PostgreSQL/Redis; stateless API, Redis pub/sub for cross-instance broadcasts; split WS gateway later (TD-002). 99.5% MVP uptime target (NFR-020).
- **CI/CD (`DEVOPS`):** GitHub Actions pipeline (lint, typecheck, test, `pnpm audit` failing on critical/high, `prisma migrate deploy` to disposable DB); branch strategy; identical Docker images staging↔prod with env-var-only differences.
- **Observability (`OBS`):** 21 metrics (active rooms/participants, WS connections, messages/s, queue adds, YouTube quota + metadata failure rate, playback errors, nickname-protection rate, failed password attempts, moderation actions, rate-limit triggers, external command volume + rejection rate by code, veto windows opened/passed/vetoed, vote volume + rejected votes, webhook failures/retries, external mute/unmute + active mute counts); structured logs with request/room/session-hash, never logging passwords/tokens/host secrets/integration secrets/sensitive IPs; 12 alerts (error/disconnect spikes, DB latency, Redis down, quota exhaustion, playback failures, room-creation spam, brute-force signals, external rejection/webhook-failure spikes, veto abuse, staff command anomalies).
- **Resilience (`ERR-CIRCUIT`, §23.6):** per-dependency circuit breakers. **YouTube** (2s/4s timeouts, open 60s): accept by validated video ID with `metadata_status=partial` where policy allows, defer enrichment, disable search; reject with `YOUTUBE_METADATA_DEGRADED` if strict duration can't be verified. **Redis** (open 30s): **fail closed** for rate-limited writes, external commands, nickname password attempts, staff actions → `SERVICE_DEGRADED`; safe reads from PostgreSQL. **PostgreSQL** (open 30s): source of truth — no writes unless durably committed; readiness fails. **Webhook** (open 5min/integration): never roll back accepted state; bounded retries (3: 2s/8s/32s — DL-017) → dead-letter queue; return `WEBHOOK_DELIVERY_DEFERRED`. `/health` may stay alive in degraded mode; `/health/ready` fails on PostgreSQL (or Redis) unavailability.
- **Error registry (`ERR-REGISTRY`, §23.4):** ~50 stable codes across REST/WS/external with HTTP status, user-facing direction, and retry guidance; canonical and mirrored in `apps/api/src/lib/error-codes.ts`. Notable: `LISTENER_READ_ONLY` (403), `NICKNAME_PROTECTION_REQUIRED` (409), `EXTERNAL_USER_MUTED` (403), `NO_VETO_OPEN`/`NO_ALTERNATE_FOR_VETO` (422), `VIDEO_TOO_LONG`/`VIDEO_UNAVAILABLE` (422), `DUPLICATE_VIDEO` (409), `SONG_REQUEST_COOLDOWN` (429), `EXTERNAL_COMMAND_REPLAY`/`DUPLICATE` (409), `SERVICE_DEGRADED`/`DEPENDENCY_UNAVAILABLE` (503).
- **Testing (`TEST`):** unit (selection, validation, tier gate, rate limits, veto threshold), integration (room/join flows, listener escalation attempts, external command + abuse scenarios, moderation), WebSocket (snapshot, reconnect, rate limit), E2E (read-only room, gated-control prompts, protect-and-join), load (latency, capacity, command bursts). Coverage tied to the traceability matrix (§37). Frontend coverage lighter than backend (TD-006).

---

## Playlist Mechanics & Veto (condensed)

Five mechanics: **FIFO** (append, duplicate/duration apply), **voting** (score + tie-breakers: score, earlier add, fewer recent tracks by same user; optional decay; upvote-only MVP — DL-006), **DJ rotation** (eligible active opt-ins, one pending track each, skip offline/idle/muted, can pass), **host-curated** (only host/mod add; suggestions off by default — DL-007), **suggestions require approval** (submit→approve/reject). **Mechanic change** never interrupts current song, preserves queue order by default, announces a system message, audits actor/old/new (FR-055–058); optional preserve/recalculate/clear; public-room cooldown.

**Pre-play veto** is a short gate before the next candidate plays (distinct from live skip voting of the current track). Opens only before playback and only when an alternate candidate exists; otherwise the candidate plays (`NO_ALTERNATE_FOR_VETO`). `!yay` keeps, `!nay` vetoes; one active vote per candidate (changeable); `netNays = nayCount − yayCount`; vetoed when net nays reach the configured threshold. Threshold modes: fixed, percentage (`ceil(eligible × pct)`), hybrid (`max(min, ceil(eligible × pct))`). Defaults: window 20s, hybrid, 25%, min 3 net nays, only-with-alternate, one-vote-per-user, vote-change allowed. A vetoed song isn't reselected the same cycle; on exhaustion, play the last candidate (DL-014). Requester votes allowed (DL-013).

**Song request policy (`FEAT-SRPOLICY`):** `open` / `per_user_cooldown` / `after_user_song_finishes` / `staff_only` / `closed`. Public-integration defaults: `per_user_cooldown` 90s, `maxPendingPerUser` 2, `maxQueueSize` 50, `maxDurationSeconds` 600, `block_recent` duplicates, veto enabled (hybrid).

---

## Decision Summary (DL-001…DL-020)

Global nicknames (DL-001); host link MVP / nickname-bind Phase 2 (DL-002); 14-day inactivity expiry (DL-003); 100-message join history (DL-004); public directory Phase 2 (DL-005); upvote-only MVP, downvotes Phase 2 (DL-006); host-curated has no default suggestions (DL-007); block reserved/confusable names, no profanity filter MVP (DL-008); 10-char min password (DL-009); 3s sync tolerance (DL-010); external integration MVP should-have, native-first (DL-011); external records per-integration-per-room (DL-012); requester veto votes allowed (DL-013); play last candidate on veto exhaustion, configurable Phase 2 (DL-014); no mandatory trust signals beyond stable external user ID, optional `accountCreatedAt`/`messageCount` (DL-015); Phase-2 chat confirmation for destructive staff actions (DL-016); 3 webhook retries + DLQ, dashboard Phase 2 (DL-017); unique command prefix per room/channel (DL-018); **mandatory native protection, free listening, scoped to native site** (DL-019); **listener chat hidden by default via `listener_chat_visible`** (DL-020). All 18 original open questions resolved; DL-019/020 added in v1.4.0.

---

## Known Limitations & Technical Debt

LIM-001 no password recovery (now blocks participation; Phase 2 recovery without mandatory registration); LIM-002 no public directory (Phase 2); LIM-003 no nickname profanity filter (Phase 2); LIM-004 approximate sync (accepted); LIM-005 no mobile-native apps (post-MVP); LIM-006 read-only embed by default (Phase 2 identity bridge); LIM-007 protection adds onboarding friction (accepted; monitor conversion). TD-001 `external_chat_music` JSONB blob (promote sub-objects if per-field querying emerges); TD-002 single-process API+WS (split later); TD-003 no webhook DLQ inspection UI (Phase 2 dashboard); TD-004 no background metadata refresh (Phase 2 job); TD-005 manual backup-restore testing (automate by Milestone 6); TD-006 frontend coverage gap (ongoing).

---

## Implementation Milestones (effort)

M1 Foundation (M) — schema incl. `room_sessions.access_tier`/`listener_chat_visible`, room creation, listener + member join/upgrade, tier-encoded tokens + server-side gating middleware, tier-aware WS snapshot. M2 Chat & Presence (S). M3 YouTube Queue & Playback (M). M4 Playlist Mechanics (M). M5 Nickname Protection UX (M) — protect-and-join, authenticate, failed-attempt limits, listener UI + inline upgrade prompts, in-place upgrade, no-recovery warning (core tier model already in M1). M6 Moderation & Hardening (M). M7 External Embeds & Chat Integrations (XL). MVP M1–M6 ≈ 16–24 weeks (2–3 engineers); M7 adds 6–10 weeks.

---

## Recommended Defaults (selected)

FIFO (private) / voting (public) mechanic; max song 10 min; block-if-queued duplicates; chat 5/10s; add-song 30s cooldown; nickname 2–24 chars; password ≥10; **protected nickname required to chat/vote/add/react, listening free**; **listener chat hidden**; skip-vote 50% of active non-muted (min 2); mechanic cooldown 5 min (public); 14-day room expiry; embed `player_and_queue_readonly`; command prefix `!`; external SR `per_user_cooldown` 90s, max pending 2, max queue 50, `block_recent`; veto window 20s, hybrid 25% / min 3, only-with-alternate, vote-changes allowed.

---

*Authority reminders for agents: §19.5 (`SEC-EXTINTEG`) overrides any external-security reference copy; §23.4 (`ERR-REGISTRY`) is the canonical error list; §4 (`DEF`) is canonical terminology; `/api/v1/` is the authoritative API version; never weaken the server-side tier gate (`SEC-TIER`, NFR-038, FR-028). See `trackstacc-ai-documentation-plan.md` §1.4/§6.5 for flagged source discrepancies — surface, don't silently reconcile.*
