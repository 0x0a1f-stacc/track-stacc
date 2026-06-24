# trackstacc-feature-maps.md

> **Engineering Knowledge-Graph Layer — Deliverable 2 of 7**
> One dependency map per major product feature. Answers: _"What parts of the system implement this feature, and how does it fail?"_
> Uses the `FEAT-*` IDs from `trackstacc-ai-documentation-plan.md` §2.3 and links components (§13), data (§14), APIs (§15), WS (§16), security (§19), acceptance (§31 via the AC-MAP in `trackstacc-requirements-graph.md`), error codes (§23.4), and observability signals (§24).
> **Failure Modes** combine the §23.4 error registry, §23.6 circuit-breaker degradation, and §32 risks. **Observability Signals** are drawn verbatim-in-spirit from §24.1 metrics / §24.3 alerts.

**Authority reminders:** External-feature security defers to `SEC-EXTINTEG` (§19.5, authoritative). `SEC-TIER` (NFR-038 + FR-028) is the non-negotiable native gate. Error codes are canonical per `ERR-REGISTRY` (§23.4).

---

## FEAT-LISTEN — Free read-only listening (Listener tier)

- **Purpose:** Let anyone open a native room and hear playback + view the playlist/queue with no nickname or password (FR-019); the on-ramp that keeps the no-registration promise while protection is mandatory for participation.
- **Dependencies:** `FEAT-NICKPROT` (upgrade path), `FEAT-PLAYBACK` (read stream), `FEAT-QUEUE` (read view), `FEAT-CHAT` (conditional read via `listener_chat_visible`). Identity Service (§13.3) issues the listener tier; Frontend Client (§13.1) renders gated prompts.
- **Data Entities:** `DATA-SESSIONS` (`room_sessions.access_tier = listener`), `DATA-ROOMS` (`listener_chat_visible`).
- **APIs:** `API-NICK` `POST /api/rooms/:roomId/listen`.
- **WebSockets:** `WS-CONN` `room.snapshot`; read-only `WS-PLAYBACK` `playback.state`, `WS-QUEUE` `queue.updated`; `WS-CHAT` only when `listener_chat_visible = true`.
- **Security Controls:** `SEC-TIER` (listener tier encoded in signed token, re-derived server-side); `ROOM_PASSWORD_REQUIRED` if room is password-protected.
- **Acceptance Criteria:** `AC-V140-1`, `AC-V140-6`, `AC-JOIN-1`.
- **Failure Modes:** Listener attempts interactive action → `LISTENER_READ_ONLY` (403) with upgrade prompt (never silent failure); PostgreSQL down → snapshot may serve stale read-only state if marked stale and secret-free (§23.6 PG rule); room not found → `ROOM_NOT_FOUND`.
- **Observability Signals:** Listener→member conversion via _nickname protection rate_ (§24.1 #10), _active participants_ (#2), _room creation rate_ (#9). Risk watch: low conversion (§32 LIM-007).
- **Decisions:** DL-019 (mandatory protection), DL-020 (listener chat hidden default).

---

## FEAT-NICKPROT — Protected-nickname participation gate

- **Purpose:** Require an authenticated password-protected nickname before any native interactive action (FR-010, FR-028); the core v1.4.0 access-control feature.
- **Dependencies:** `FEAT-LISTEN` (the tier it upgrades from); gates `FEAT-CHAT`, `FEAT-QUEUE`, `FEAT-MOD`, voting, reactions. Identity Service (§13.3) + Auth Middleware own enforcement; Rate Limit Service (§13.9) throttles password attempts.
- **Data Entities:** `DATA-NICKNAMES` (`nickname_claims.password_hash`), `DATA-SESSIONS` (`access_tier`, in-place upgrade).
- **APIs:** `API-NICK` `POST /api/nicknames/{check,protect,authenticate}`, `POST /api/rooms/:roomId/{listen,join}`, `.../nickname/change`.
- **WebSockets:** `WS-C2S` — every interactive event carries a minimum-tier check; `WS-S2C` `presence.updated`, system `chat.message` on protect/change.
- **Security Controls:** `SEC-TIER` (**must never be weakened**; tier from signed token `accessTier`, DB fallback — §19.4), `SEC-PWD` (Argon2id, never plaintext/logged/returned — §19.3), brute-force rate limits by nickname/IP/global (§19.2).
- **Acceptance Criteria:** `AC-V140-2`, `AC-V140-3`, `AC-V140-5`, `AC-V140-7`, `AC-JOIN-1`…`AC-JOIN-4`.
- **Failure Modes:** Unprotected interaction → `NICKNAME_PROTECTION_REQUIRED` (409) / `LISTENER_READ_ONLY` (403); taken name → `NICKNAME_TAKEN` (409); wrong password → `NICKNAME_PASSWORD_INCORRECT` (403) → repeated → `NICKNAME_PASSWORD_RATE_LIMITED` (429); forgotten password unrecoverable in MVP (LIM-001); Redis down → password attempts **fail closed** (§23.6 Redis rule).
- **Observability Signals:** §24.1 _nickname protection rate_ (#10), _failed nickname password attempts_ (#11); §24.3 alert _high password brute-force signals_ (#8).
- **Decisions:** DL-001 (global nicknames), DL-008 (reserved-name blocking), DL-009 (10-char password), DL-019.

---

## FEAT-ROOMCREATE — Room creation & host setup

- **Purpose:** Create a room without registration and grant host authority (FR-001–006).
- **Dependencies:** `FEAT-NICKPROT` (host must protect a nickname to exercise authority — `AC-V140-7`), `FEAT-MECHANICS` (default mechanic), `FEAT-ROOMSETTINGS`. Room Service (§13.2) + Identity Service (§13.3).
- **Data Entities:** `DATA-ROOMS` (`host_secret_hash`, `playlist_mechanic`, config), `DATA-SESSIONS`.
- **APIs:** `API-ROOMS` `POST /api/rooms`, `POST /api/rooms/:roomId/join` (cookie-based host upgrade), `POST /api/rooms/:roomId/password/verify`.
- **WebSockets:** `WS-CONN` token rotation on host upgrade/activation.
- **Security Controls:** `SEC-SESSION` (httpOnly cookie + WS token, rotate on host upgrade/activation — §19.4); host secret stored hash-only (`SEC-PWD` pattern); room password hash.
- **Acceptance Criteria:** `AC-RC-1`…`AC-RC-4`.
- **Failure Modes:** Invalid config → `VALIDATION_FAILED`; non-host claim → `HOST_REQUIRED` (403); wrong room password → `ROOM_PASSWORD_INCORRECT`; room-creation burst fails closed if Redis down (§23.6).
- **Observability Signals:** §24.1 _room creation rate_ (#9), _active rooms_ (#1); §24.3 alert _sudden room creation spam_ (#7).
- **Decisions:** DL-002 (host authority model), DL-003 (14-day expiry).

---

## FEAT-QUEUE — Collaborative queue & YouTube input

- **Purpose:** Add YouTube songs by URL with validation, dedup, and duration limits; maintain the queue (FR-030–037, FR-050–058).
- **Dependencies:** `FEAT-MECHANICS` (selection order), `FEAT-PLAYBACK` (advance), `FEAT-VETO` (pre-play gate), `YT` integration. Queue Engine (§13.4) + YouTube Metadata Service (§13.8) + Rate Limit Service.
- **Data Entities:** `DATA-QUEUE` (`queue_items` + state/position/score), `DATA-TRACKS` (`tracks`, `metadata_status`), `DATA-VOTES`.
- **APIs:** `API-QUEUE` `POST/DELETE /api/rooms/:roomId/queue/items[/:queueItemId]`, `.../vote`, `.../approve`, `.../reject`.
- **WebSockets:** `WS-QUEUE` `queue.item.added/removed`, `queue.updated`, `queue.vote.updated`.
- **Security Controls:** `SEC-TIER` (member); YouTube API key server-side only (§19.2); add-song cooldown 30s, per-user queue limits (App. A).
- **Acceptance Criteria:** `AC-QUEUE-1`…`AC-QUEUE-4`.
- **Failure Modes:** `VIDEO_URL_INVALID` (400), `VIDEO_UNAVAILABLE` (422), `VIDEO_TOO_LONG` (422), `DUPLICATE_VIDEO` (409), `QUEUE_LOCKED` (403), `QUEUE_FULL` (409); YouTube breaker open → `YOUTUBE_METADATA_DEGRADED` (503), may accept with `metadata_status=partial` when room policy permits, search disabled (§23.6.2 #1).
- **Observability Signals:** §24.1 _queue additions per minute_ (#5), _YouTube API quota usage_ (#6), _YouTube metadata failure rate_ (#7); §24.3 alert _YouTube quota exhaustion_ (#5).
- **Decisions:** DL-006 (upvote-only MVP), DL-007 (host-curated suggestions).

---

## FEAT-PLAYBACK — Synchronized playback

- **Purpose:** Maintain one authoritative current-track state and keep all clients in sync (FR-040–046); resync target ≤3s (NFR-003).
- **Dependencies:** `FEAT-QUEUE` (next item), `FEAT-VETO` (pre-play window before start), `SYNC` (§18 server time model). Playback Coordinator (§13.5).
- **Data Entities:** `DATA-QUEUE` (`queue_items` state/started_at/ended_at), `DATA-SKIPVOTES` (`skip_votes`).
- **APIs:** `API-QUEUE`/playback `POST /api/rooms/:roomId/playback/skip`, `.../skip-vote`.
- **WebSockets:** `WS-PLAYBACK` `playback.state`, `playback.resync`, `playback.clientState` (C2S), `playback.skipVote`; `room.snapshot` on connect.
- **Security Controls:** server-authoritative for all playback decisions (`ARCH` §12); `MODERATOR_REQUIRED`/`HOST_REQUIRED` to force-skip; skip-vote requires member tier.
- **Acceptance Criteria:** `AC-PLAY-1`…`AC-PLAY-4`.
- **Failure Modes:** Embedded player fails → client reports, server may mark failed/skip (FR-046); drift beyond target → resync (LIM-004, §32); `TRACK_NOT_FOUND`; `VIDEO_UNAVAILABLE` on advance.
- **Observability Signals:** §24.1 _playback error rate_ (#8), _WebSocket connections_ (#3); §24.3 alert _high playback failure rate_ (#6).
- **Decisions:** DL-010 (3s sync), DL-014 (play last candidate on veto exhaustion).

---

## FEAT-MECHANICS — Playlist mechanics & safe changes

- **Purpose:** Support FIFO/voting/DJ-rotation/host-curated/moderated-suggestion modes and allow safe live mechanic changes without interrupting the current song (FR-050–060).
- **Dependencies:** `FEAT-QUEUE` (selection), `FEAT-PLAYBACK` (non-interruption), `FEAT-CHAT` (system announcement), `ALGO` (§17). Queue Engine + Room Service + Playback Coordinator + Chat Service.
- **Data Entities:** `DATA-ROOMS` (`playlist_mechanic`), `DATA-SETTINGSHIST` (`room_settings_history`), `DATA-QUEUE`, `DATA-VOTES`.
- **APIs:** `API-ROOMS` `PATCH /api/rooms/:roomId/settings`.
- **WebSockets:** `WS-S2C` `room.mechanic.changed`, system `chat.message`.
- **Security Controls:** `HOST_REQUIRED`; public-room mechanic-change cooldown (default 5 min, App. A).
- **Acceptance Criteria:** `AC-MECH-1`…`AC-MECH-6`.
- **Failure Modes:** `MECHANIC_CHANGE_COOLDOWN` (429), `HOST_REQUIRED` (403); queue preserved by default (FR-058) — optional recalc/clear is Phase 2 with confirmation (FR-059).
- **Observability Signals:** settings changes appear in _moderation actions_/audit (§24.1 #12, §24.2 logs); sequence diagram §12.6.
- **Decisions:** DL-006, DL-007.

---

## FEAT-CHAT — Real-time chat

- **Purpose:** Member-tier real-time messaging with system announcements, rate limits, and listener-read controls. Listener chat read access is controlled by the room setting `listener_chat_visible` (defaulting to hidden/false), returning empty chat history to listeners unless enabled (FR-070–078).
- **Dependencies:** `FEAT-NICKPROT` (send gate), `FEAT-LISTEN` (conditional read), `FEAT-MOD` (delete/mute/lock). Chat Service (§13.6) + Rate Limit Service.
- **Data Entities:** `DATA-CHAT` (`chat_messages`, `deleted_at`), `DATA-ROOMS` (`listener_chat_visible`), `DATA-SESSIONS` (`is_muted`).
- **APIs:** `API-CHAT` `GET /api/rooms/:roomId/chat/messages?before=&limit=`, `DELETE .../chat/messages/:messageId`.
- **WebSockets:** `WS-CHAT` `chat.send` (C2S), `chat.message`/`chat.deleted` (S2C).
- **Security Controls:** `SEC-TIER` (member to send); content sanitization/escape + CSP (XSS, §19.2/§19.6); chat rate limit 5 msg / 10s (App. A, FR-073).
- **Acceptance Criteria:** `AC-CHAT-1`…`AC-CHAT-5`, `AC-V140-6`.
- **Failure Modes:** `LISTENER_READ_ONLY` (send/delete/moderate by listener), `MUTED` (403), `CHAT_LOCKED` (403), `RATE_LIMITED` (429); history capped at 100 (DL-004). Note that `GET /api/rooms/:roomId/chat/messages` returns `200 OK` with an empty messages list `[]` for listeners if `listenerChatVisible` is disabled (does not return `403` error). Realtime `chat.message`/`chat.deleted` delivery follows the same listener privacy boundary — chat events are broadcast to a dedicated Socket.IO sub-channel (`room:${roomId}:chat`) that listeners only join when `listenerChatVisible` enables it.
- **Observability Signals:** §24.1 _messages per second_ (#4), _rate-limit triggers_ (#13); §24.3 alert _API error rate spikes_ (#1).
- **Decisions:** DL-004 (100-message history), DL-020 (listener chat hidden default).

---

## FEAT-MOD — Native moderation

- **Purpose:** Host/mod tools — mute, ban, remove items, skip, assign roles, lock queue/chat, audit (FR-080–088).
- **Dependencies:** `FEAT-CHAT`, `FEAT-QUEUE`, `FEAT-PLAYBACK`; `FEAT-PRESENCE` (participant list convergence after moderation actions); `MOD-NATIVE` (§20.2). Moderation Service (§13.7).
- **Data Entities:** `DATA-MODACTIONS` (`room_moderation_actions`), `DATA-SESSIONS` (`is_muted`/`is_banned`/`left_at`), `DATA-CHAT`, `DATA-QUEUE`.
- **APIs:** `API-MOD` `POST /api/rooms/:roomId/moderation/{mute,unmute,ban,unban,assign-moderator,revoke-moderator}`.
- **WebSockets:** `WS-MOD` `moderation.action` (C2S), `moderation.applied` (S2C) — broadcast to all room participants with action type, target session, room, actor, optional reason; `WS-PRESENCE` `presence.updated` — broadcast to all room participants after every action (muted targets keep `isMuted: true` in participant list; banned targets are omitted; observer sockets remain connected).
- **Security Controls:** `HOST_REQUIRED` (ban/unban) / `MODERATOR_REQUIRED` (mute/unmute); server-side role check on every write (§19.2 #7); moderation hierarchy enforced (no self-moderation, moderator cannot moderate host or another moderator); audit logging (NFR-067). Ban additionally evicts target from Redis presence and disconnects all active Socket.IO connections for the banned session. Banned sessions are rejected during WebSocket connection validation (`session.isBanned`) and blocked from same-room rejoin via `POST /api/rooms/:roomId/join` (`BANNED`, 403).
- **Acceptance Criteria:** `AC-CHAT-3` + moderation-action criteria (`MOD-NATIVE`).
- **Failure Modes:** `MODERATOR_REQUIRED`/`HOST_REQUIRED` (403), `FORBIDDEN` (403, self-moderation or hierarchy violation), `BANNED` (403), `MUTED` (403), `CHAT_MESSAGE_NOT_FOUND` (404), `QUEUE_ITEM_NOT_FOUND` (404).
- **Observability Signals:** §24.1 _moderation actions_ (#12); §24.2 logs include action type + reason.
- **Decisions:** —

---

## FEAT-EMBED — Read-only external embeds

- **Purpose:** Provide a read-only embeddable room/player/queue/veto view for embedding sites (FR-110–113).
- **Dependencies:** `FEAT-EXTCMD` (config/identity bridge), `FEAT-PLAYBACK`/`FEAT-QUEUE`/`FEAT-VETO` (read state). Embeddable Room Client (§13.10).
- **Data Entities:** read-only snapshot of `DATA-ROOMS`/`DATA-QUEUE`/`DATA-VETOWIN`; `DATA-INTEGRATIONS` (`allowed_origins`).
- **APIs:** `API-INTEG` `GET /api/embed/rooms/:roomSlug`, `GET .../snapshot`.
- **WebSockets:** read-only `WS-S2C` subscription.
- **Security Controls:** **`SEC-EXTINTEG` (§19.5, authoritative)**; `SEC-CSP` dynamic `frame-ancestors` per integration (§19.6.4); `SEC-CORS` per-integration origins; `SEC-FRAME`; **no secrets in iframe URL / JS / storage / postMessage / snapshot** (§19.6.4).
- **Acceptance Criteria:** `AC-EXT-3`, `AC-STAFF-7`.
- **Failure Modes:** Disallowed origin → CSP/CORS rejection (logged, §19.6.2 #9); `ROOM_NOT_FOUND`; no privileged mutation callable from embed (FR-114).
- **Observability Signals:** rejected-origin logs (§19.6.2); §24.1 _integration abuse/rate-limit triggers_ (#19).
- **Decisions:** Default embed mode `player_and_queue_readonly` (App. A). Note: §14.2 `embedMode` enum vs §13.10 — see plan §1.4.

---

## FEAT-EXTCMD — External chat command bridge

- **Purpose:** Accept external chat commands (`!sr`, `!yay`/`!nay`, `!song`, `!queue`, staff commands) over a server-to-server endpoint and post signed bot replies (FR-115–119, FR-170–179).
- **Dependencies:** `FEAT-EMBED`, `FEAT-SRPOLICY`, `FEAT-VETO`, `FEAT-EXTSTAFF`, `FEAT-EXTMUTE`. External Command Service (§13.11) + Outbound Bot Webhook Service (§13.12) + Rate Limit Service.
- **Data Entities:** `DATA-INTEGRATIONS`, `DATA-EXTPART`, `DATA-EXTCMD` (idempotency), `DATA-EXTREF`, `DATA-EXTCONFIG`.
- **APIs:** `API-INTEG` `POST /api/integrations/site-command` (+ outbound webhook egress).
- **WebSockets:** `WS-INTEG` `integration.command.received/accepted/rejected`, `external.bot_message.created`.
- **Security Controls:** **`SEC-EXTINTEG` (§19.5, authoritative)** — HMAC/bearer auth, timestamp freshness, replay protection, idempotency by message ID, strict schema validation, multi-level rate limits, sanitization, signed outbound webhooks (defense-in-depth items 1–13).
- **Acceptance Criteria:** `AC-EXT-4`…`AC-EXT-8`, `AC-STAFF-6`.
- **Failure Modes:** `INTEGRATION_AUTH_INVALID` (401), `EXTERNAL_COMMAND_REPLAY` (409), `EXTERNAL_COMMAND_DUPLICATE` (409, returns original result), `INVALID_COMMAND_SYNTAX` (400), `RATE_LIMITED` (429); webhook breaker open → accepted state preserved, `WEBHOOK_DELIVERY_DEFERRED` (503), bounded retries → DLQ (§23.6 webhook rule, DL-017).
- **Observability Signals:** §24.1 _external command volume_ (#14), _external command rejection rate by result code_ (#15), _outbound webhook failures/retries_ (#18), _integration abuse triggers_ (#19); §24.3 alerts _external command rejection spikes_ (#9), _outbound webhook failure spikes_ (#10).
- **Decisions:** DL-011, DL-012, DL-015, DL-017, DL-018.

---

## FEAT-VETO — Pre-play veto

- **Purpose:** Let eligible users `!yay`/`!nay` an upcoming candidate before it plays, vetoing it at a configured threshold (FR-130–143).
- **Dependencies:** `FEAT-QUEUE` (alternate candidate must exist), `FEAT-PLAYBACK` (window opens before start), `FEAT-EXTCMD` (vote ingress), `ALGO` (§17.6 advance cycle). Queue Engine (veto logic) + Playback Coordinator.
- **Data Entities:** `DATA-VETOVOTES` (`preplay_veto_votes`, one active vote/candidate/voter), `DATA-VETOWIN` (`preplay_veto_windows`, status + threshold snapshot), `DATA-QUEUE`.
- **APIs:** `API-INTEG` `POST /api/integrations/site-command` (`!yay`/`!nay`).
- **WebSockets:** `WS-QUEUE` `queue.item.veto_window.opened/.updated`, `queue.item.vetoed`, `queue.item.veto_passed`; `WS-PLAYBACK` `playback.state`.
- **Security Controls:** one vote per stable external user ID (`MOD-EXTVOTE`, §19.2); requester eligibility (DL-013); no anonymous embed votes by default.
- **Acceptance Criteria:** `AC-VETO-1`…`AC-VETO-7`.
- **Failure Modes:** `NO_VETO_OPEN` (422), `NO_ALTERNATE_FOR_VETO` (422), `VETO_WINDOW_CLOSED` (409), `VOTE_NOT_ALLOWED` (403); on exhaustion play last candidate (DL-014).
- **Observability Signals:** §24.1 _veto windows opened/passed/vetoed_ (#16), _vote volume + rejected attempts_ (#17); §24.3 alert _veto abuse signals / repeated exhaustion in public room_ (#11).
- **Decisions:** DL-013, DL-014; defaults 20s window, hybrid 25%/min-3 net nays (App. A); sequence diagram §12.6.

---

## FEAT-SRPOLICY — Song request policy

- **Purpose:** Govern external song additions via policy modes: open / per-user-cooldown / after-user-song-finishes / staff-only / closed (FR-157–161, FR-173).
- **Dependencies:** `FEAT-EXTCMD`, `FEAT-QUEUE`, `FEAT-EXTSTAFF` (policy changes), `FEAT-EXTMUTE`. External Command Service + Queue Engine + Rate Limit Service.
- **Data Entities:** `DATA-EXTCONFIG` (`songRequestPolicy` JSONB on `rooms`), `DATA-EXTPART`, `DATA-QUEUE`.
- **APIs:** `API-INTEG` `POST /api/integrations/site-command` (`!sr`, policy commands).
- **WebSockets:** `WS-INTEG` `external.bot_message.created`.
- **Security Controls:** **`SEC-EXTINTEG`**; per-user cooldown by external user ID (default 90s, App. A); max pending 2; max queue 50; blocked-content policy.
- **Acceptance Criteria:** `AC-EXT-6`, `AC-STAFF-4`.
- **Failure Modes:** `SONG_REQUEST_POLICY_CLOSED` (403), `SONG_REQUEST_COOLDOWN` (429), `MAX_PENDING_PER_USER_REACHED` (409), `QUEUE_FULL` (409).
- **Observability Signals:** §24.1 _external command volume / rejection rate_ (#14/#15); §24.1 _external staff command volume & settings changes_ (#20).
- **Decisions:** Note: §14.2 `songRequestPolicy.mode` enum (`open|cooldown|allowlist|closed`) differs from §11.10 product modes — see plan §1.4.

---

## FEAT-EXTSTAFF — External staff commands

- **Purpose:** Authorize staff (by external user ID allowlist or trusted role mapping) to remove items, force-skip, and change settings via chat commands (FR-150–162).
- **Dependencies:** `FEAT-EXTCMD`, `FEAT-QUEUE`, `FEAT-PLAYBACK`, `FEAT-SRPOLICY`, `FEAT-VETO`. External Command Service + Moderation Service + Queue Engine.
- **Data Entities:** `DATA-INTEGRATIONS` (staff allowlist/role map), `DATA-EXTCMD`, `DATA-QUEUE`, `DATA-EXTREF`, `DATA-ROOMS`, `DATA-SETTINGSHIST`, `DATA-MODACTIONS`.
- **APIs:** `API-INTEG` `POST /api/integrations/site-command` (`!rm`, `!skip`, `!music ...`).
- **WebSockets:** `WS-QUEUE` `queue.item.removed`; `WS-PLAYBACK` `playback.state`; `WS-INTEG` `room.external_settings.changed`, `external.bot_message.created`.
- **Security Controls:** **`SEC-EXTINTEG`** — server-side authorization, no client-side trust; staff-only failure reasons must not reveal allowlists/secrets/role claims (§23.5 #3); audit accepted+rejected privileged commands.
- **Acceptance Criteria:** `AC-STAFF-1`…`AC-STAFF-5`.
- **Failure Modes:** `EXTERNAL_COMMAND_UNAUTHORIZED` (403), `EXTERNAL_ROLE_UNTRUSTED` (403), `QUEUE_ITEM_NOT_FOUND` (404).
- **Observability Signals:** §24.1 _external staff command volume & settings changes_ (#20); §24.3 alert _staff command anomalies / excessive settings changes_ (#12).
- **Decisions:** DL-016 (Phase-2 staff confirmation).

---

## FEAT-EXTMUTE — External participant muting

- **Purpose:** Let staff timed- or permanently-mute an external participant from `!sr`/`!yay`/`!nay` while preserving read-only commands, with auto-expiry and early unmute (FR-163–168).
- **Dependencies:** `FEAT-EXTSTAFF`, `FEAT-EXTCMD`, `FEAT-VETO`, `FEAT-SRPOLICY`. External Command Service + Moderation Service.
- **Data Entities:** `DATA-EXTPART` (mute fields: muted flag, expiry, reason), `DATA-MODACTIONS`.
- **APIs:** `API-INTEG` `POST /api/integrations/site-command` (`!music mute/unmute`).
- **WebSockets:** `WS-INTEG` `external.bot_message.created`.
- **Security Controls:** **`SEC-EXTINTEG`**; rate-limit + audit + explicit duration (`MOD-EXTMUTE`, §20.3); lazy TTL check on next command + periodic cleanup (§10.18, §20.3).
- **Acceptance Criteria:** `AC-STAFF-8`…`AC-STAFF-11`.
- **Failure Modes:** Muted user `!sr`/`!yay`/`!nay` → `EXTERNAL_USER_MUTED` (403); read-only `!song`/`!queue` still allowed (FR-168); TTL auto-expiry race mitigated by lazy check (§32).
- **Observability Signals:** §24.1 _external mute/unmute actions + active mute counts_ (#21); §24.2 logs include mute reason + duration.
- **Decisions:** —

---

## FEAT-PRESENCE — Presence

- **Purpose:** Show active participants and drive DJ-rotation eligibility (FR-090–092).
- **Components:** Socket.IO Gateway, Presence Manager, Frontend Client, Identity/Nickname session flow.
- **Dependencies:** `FEAT-MECHANICS` (DJ rotation), `FEAT-LISTEN` (listen rehydration), `FEAT-NICKPROT` (upgrade/join flow rehydration).
- **Data Entities:** `DATA-SESSIONS` (`room_sessions`), Redis presence state (ZSET).
- **APIs/events:** `POST /api/rooms/:roomId/listen`, `POST /api/rooms/:roomId/join`, `room.snapshot`, `presence.heartbeat`, `presence.updated`.
- **Security Controls:** `SEC-TIER` (tier validated server-side from signed WS token).
- **Acceptance Criteria:** `AC-PRESENCE-1` to `AC-PRESENCE-9` (Presence Lifecycle acceptance criteria, §31.10).
- **Failure Modes:** Redis degraded fallback (PostgreSQL `lastSeenAt`/`leftAt` active session query and sweep cleanup), stale sessions (duplicate rows avoided on refresh/reconnect by rehydrating the same session), reconnect convergence (clients replace local state with server-authoritative snapshots/updates), external participants out of scope.
- **Observability Signals:** §24.1 _active participants_ (#2), _WebSocket connections_ (#3); §24.3 alert _WebSocket disconnect spikes_ (#2), _Redis presence degradation_ (logs/metrics).
- **Decisions:** —

---

## FEAT-ROOMSETTINGS — Room settings

- **Purpose:** Let the host update name/description, duration limits, duplicate policy, add-song permissions, skip threshold, visibility, and room password (FR-100–106).
- **Dependencies:** `FEAT-ROOMCREATE`, `FEAT-MECHANICS`, `FEAT-QUEUE`, `FEAT-MOD`. Room Service.
- **Data Entities:** `DATA-ROOMS`, `DATA-SETTINGSHIST`.
- **APIs:** `API-ROOMS` `PATCH /api/rooms/:roomId/settings`.
- **WebSockets:** `WS-S2C` `room.settings.changed`.
- **Security Controls:** `HOST_REQUIRED`; room password hash (`SEC-PWD`, FR-106 Phase 2).
- **Acceptance Criteria:** `AC-MECH-6` (settings recorded in history/audit).
- **Failure Modes:** `HOST_REQUIRED` (403), `VALIDATION_FAILED` (400).
- **Observability Signals:** settings changes in audit logs (§24.2).
- **Decisions:** DL-003 (14-day expiry default).
