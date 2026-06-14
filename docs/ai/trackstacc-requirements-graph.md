# trackstacc-requirements-graph.md

> **Engineering Knowledge-Graph Layer — Deliverable 1 of 7**
> Requirements → Implementation traceability. One graph node per functional requirement (or SDD-grouped FR range), linking every artifact that implements, validates, secures, or governs it.
> Built on the stable IDs in `trackstacc-ai-documentation-plan.md` §2 and the cross-reference maps in §4. Source spine: SDD §7 (requirements), §37.1 (traceability matrix), §15.2 (APIs), §16 (WS), §14 (data), §19 (security), §23.4 (errors), §31 (acceptance), §28 (decisions), §32 (risks). Nothing here overrides the SDD; it indexes it.

## How to read a node

```
FR-XXX — short title (SDD §7.x, priority)
Description: verbatim/condensed requirement text
Implements:     FEAT-* product features this FR realizes
Workflows:      WF-* user flows (SDD §10) that exercise it
Components:     COMP services (SDD §13) that own the logic
Data:           DATA-* tables / columns (SDD §14) touched
APIs:           API-* group + concrete endpoint(s) (SDD §15.2, /api/v1)
WebSockets:     WS-* family + concrete event(s) (SDD §16)
Security:       SEC-* controls (SDD §19) that protect it
Errors:         §23.4 error codes returned on failure
Acceptance:     AC-* stable IDs (this file's §AC-MAP → SDD §31 bullets)
Risks:          RISK rows (SDD §32) it touches
Decisions:      DL-* decisions (SDD §28) that constrain it
```

**Authority reminders (carried from the base layer):** `SEC-EXTINTEG` (SDD §19.5) is the single authoritative source for external-integration security — any external FR's security row defers to it. `ERR-REGISTRY` (SDD §23.4) is the canonical error list. The `SEC-TIER` server-side native tier gate (NFR-038 + FR-028) must never be weakened.

---

## AC-MAP — Stable Acceptance-Criteria IDs

The SDD states acceptance criteria as grouped bullets (§31.0–§31.9) without per-line IDs. The stable IDs below are **additive navigation anchors**; each maps to a bullet under the cited SDD subsection. They do not replace or reword the source.

| Stable AC ID range | SDD § | Area |
| --- | --- | --- |
| `AC-P1-1…6` | §31.0 | Priority-1 audit remediation (error registry, envelopes, CORS/CSP, breakers, Fastify decision, external roles) |
| `AC-P2-1…9` | §31.0.1 | Priority-2 audit remediation (diagrams, migrations, API conventions, WS backoff, §19.5 consolidation, decision log, milestones, traceability) |
| `AC-V140-1…8` | §31.0.2 | v1.4.0 mandatory native nickname protection |
| `AC-RC-1…4` | §31.1 | Room creation |
| `AC-JOIN-1…4` | §31.2 | Room join (listener/member) |
| `AC-CHAT-1…5` | §31.3 | Chat |
| `AC-QUEUE-1…4` | §31.4 | Queue |
| `AC-PLAY-1…4` | §31.5 | Playback |
| `AC-MECH-1…6` | §31.6 | Playlist mechanic changes |
| `AC-EXT-1…8` | §31.7 | External site integration |
| `AC-VETO-1…7` | §31.8 | Pre-play veto |
| `AC-STAFF-1…11` | §31.9 | External staff commands & abuse controls |

---

## Group 7.1 — Room Creation (`FEAT-ROOMCREATE`)

### FR-001 — Create room without registration (§7.1, MVP)
- **Description:** Users can create a room without registration.
- **Implements:** `FEAT-ROOMCREATE`
- **Workflows:** `WF-CREATE`
- **Components:** Room Service (`COMP` §13.2)
- **Data:** `DATA-ROOMS` (`rooms`)
- **APIs:** `API-ROOMS` `POST /api/v1/rooms`
- **WebSockets:** — (room becomes live on first connect: `WS-CONN` `room.snapshot`)
- **Security:** `SEC-SESSION` (host session issued); deny-by-default `SEC-CORS`
- **Errors:** `VALIDATION_FAILED`
- **Acceptance:** `AC-RC-1`, `AC-RC-3`
- **Risks:** No-registration abuse (§32)
- **Decisions:** DL-002 (host authority model)

### FR-002 — Default playlist mechanic chosen at creation (§7.1, MVP)
- **Description:** Room creator must choose or accept a default playlist mechanic.
- **Implements:** `FEAT-ROOMCREATE`, `FEAT-MECHANICS`
- **Workflows:** `WF-CREATE`
- **Components:** Room Service
- **Data:** `DATA-ROOMS` (`rooms.playlist_mechanic`)
- **APIs:** `API-ROOMS` `POST /api/v1/rooms`
- **WebSockets:** —
- **Security:** `SEC-SESSION`
- **Errors:** `VALIDATION_FAILED`
- **Acceptance:** `AC-RC-1`
- **Risks:** —
- **Decisions:** DL-006 (upvote-only MVP voting), DL-007 (no default suggestions in host-curated)

### FR-003 — Host authority via secure host session/link (§7.1, MVP)
- **Description:** Room creator receives host authority via secure host session and/or host link.
- **Implements:** `FEAT-ROOMCREATE`
- **Workflows:** `WF-CREATE`
- **Components:** Room Service, Identity Service (`COMP` §13.3)
- **Data:** `DATA-ROOMS` (`rooms.host_secret_hash`)
- **APIs:** `API-ROOMS` `POST /api/v1/rooms`, `POST /api/v1/rooms/:roomId/host/claim`
- **WebSockets:** `WS-CONN` (token rotation on host claim)
- **Security:** `SEC-SESSION` (httpOnly cookie + short-lived WS token; rotate on privilege escalation, §19.4); host secret stored hash-only (`SEC-PWD` pattern, §19.2)
- **Errors:** `HOST_REQUIRED`, `SESSION_INVALID`
- **Acceptance:** `AC-RC-2`, `AC-V140-7` (host must hold protected nickname)
- **Risks:** Host link leaked → room takeover (§32)
- **Decisions:** DL-002 (host secret hash + Phase-2 rotation/nickname bind)

### FR-004 / FR-005 / FR-006 — Room configuration (§7.1)
- **Description:** Optional name/description/tags/visibility/password (FR-004, MVP/Phase 2); temporary vs persistent (FR-005, Phase 2); queue/duration/duplicate limits (FR-006, MVP).
- **Implements:** `FEAT-ROOMCREATE`, `FEAT-ROOMSETTINGS`
- **Workflows:** `WF-CREATE`
- **Components:** Room Service, Queue Engine (`COMP` §13.4, limit validation)
- **Data:** `DATA-ROOMS` (incl. `max_song_duration_seconds`, duplicate policy, expiry config)
- **APIs:** `API-ROOMS` `POST /api/v1/rooms`, `PATCH /api/v1/rooms/:roomId/settings`
- **WebSockets:** `WS-S2C` `room.settings.changed`
- **Security:** `SEC-SESSION`; room password hash (`SEC-PWD`)
- **Errors:** `VALIDATION_FAILED`, `ROOM_PASSWORD_REQUIRED` (downstream)
- **Acceptance:** `AC-RC-1`
- **Risks:** —
- **Decisions:** DL-003 (14-day temp-room expiry)

---

## Group 7.2–7.3 — Listening, Nicknames & Protection (`FEAT-LISTEN`, `FEAT-NICKPROT`) — system-critical

### FR-010 — Protected nickname required for native participation (§7.2, MVP) ★
- **Description:** On the native site, a user must hold an authenticated protected nickname before chatting, voting, reacting, adding songs, or any interactive functionality.
- **Implements:** `FEAT-NICKPROT`
- **Workflows:** `WF-JOIN`, `WF-PROTECT`
- **Components:** Identity Service (`COMP` §13.3), Auth Middleware
- **Data:** `DATA-SESSIONS` (`room_sessions.access_tier`), `DATA-NICKNAMES` (`nickname_claims`)
- **APIs:** `API-NICK` `POST /api/v1/rooms/:roomId/join`
- **WebSockets:** `WS-C2S` (every interactive event gated by minimum tier `member`)
- **Security:** `SEC-TIER` (tier re-derived server-side every request/event), `SEC-SESSION`
- **Errors:** `NICKNAME_PROTECTION_REQUIRED` (409), `LISTENER_READ_ONLY` (403)
- **Acceptance:** `AC-V140-2`, `AC-V140-3`, `AC-JOIN-1`, `AC-JOIN-3`
- **Risks:** Listener privilege escalation; mandatory protection lowers conversion (§32)
- **Decisions:** DL-019 (mandatory native protection), DL-001 (global nicknames)

### FR-011 / FR-012 / FR-013 — No generic guests; normalization; case preservation (§7.2, MVP)
- **Description:** No `guest_1234` auto-names (FR-011); nicknames normalized for uniqueness (FR-012); display casing preserved (FR-013).
- **Implements:** `FEAT-NICKPROT`
- **Workflows:** `WF-JOIN`, `WF-PROTECT`
- **Components:** Identity Service
- **Data:** `DATA-NICKNAMES`, `DATA-SESSIONS`
- **APIs:** `API-NICK` `POST /api/v1/rooms/:roomId/join`, `POST /api/v1/nicknames/check`
- **WebSockets:** —
- **Security:** `SEC-TIER`; reserved/offensive blocking (DL-008)
- **Errors:** `NICKNAME_TAKEN`, `VALIDATION_FAILED`
- **Acceptance:** `AC-JOIN-2`
- **Risks:** Nickname impersonation (§19.1)
- **Decisions:** DL-008 (reserved-name blocking)

### FR-014 / FR-016 / FR-017 / FR-022 — Authenticate & reuse protected nickname (§7.2–7.3, MVP)
- **Description:** Correct password required to use a protected nickname (FR-014); cross-room reuse without re-claiming (FR-016, FR-022); change to another protected nickname subject to auth + rate limits (FR-017).
- **Implements:** `FEAT-NICKPROT`
- **Workflows:** `WF-PROTECT`, `WF-JOIN`
- **Components:** Identity Service, Rate Limit Service (`COMP` §13.9)
- **Data:** `DATA-NICKNAMES`, `DATA-SESSIONS`
- **APIs:** `API-NICK` `POST /api/v1/nicknames/authenticate`, `POST /api/v1/rooms/:roomId/join`, `POST /api/v1/rooms/:roomId/nickname/change`
- **WebSockets:** `WS-S2C` `presence.updated`; system `chat.message` (nickname change)
- **Security:** `SEC-PWD` (Argon2id, §19.3), `SEC-SESSION`, brute-force rate limits (§19.2)
- **Errors:** `NICKNAME_PROTECTED` (409), `NICKNAME_PASSWORD_INCORRECT` (403), `NICKNAME_PASSWORD_RATE_LIMITED` (429)
- **Acceptance:** `AC-JOIN-3`, `AC-JOIN-4`
- **Risks:** Brute force; external/native identity (§19.1)
- **Decisions:** DL-001 (global nicknames), DL-009 (10-char password)

### FR-015 / FR-020 / FR-021 — Claim/protect nickname (protect-and-join) (§7.2–7.3, MVP) ★
- **Description:** Single protect-and-join step claims a new nickname + password (FR-015, FR-020); passwords stored only as salted hashes (FR-021).
- **Implements:** `FEAT-NICKPROT`
- **Workflows:** `WF-PROTECT`
- **Components:** Identity Service
- **Data:** `DATA-NICKNAMES` (`nickname_claims.password_hash`)
- **APIs:** `API-NICK` `POST /api/v1/nicknames/protect`, `POST /api/v1/rooms/:roomId/join` (protect-and-join)
- **WebSockets:** `WS-S2C` `presence.updated`; system `chat.message` "protected their nickname"
- **Security:** `SEC-PWD` (Argon2id, never plaintext/log/return hash — §19.3); password min 10 chars (DL-009)
- **Errors:** `NICKNAME_TAKEN` (409), `VALIDATION_FAILED` (weak password)
- **Acceptance:** `AC-V140-3`, `AC-JOIN-3`
- **Risks:** Weak passwords (§19.2); forgotten password (no recovery MVP — §32, LIM-001)
- **Decisions:** DL-001, DL-009, DL-019

### FR-019 — Free read-only Listener access (§7.2, MVP) ★
- **Description:** Any native user may open a room and remain a read-only Listener — hearing playback and viewing playlist/queue — without nickname or password.
- **Implements:** `FEAT-LISTEN`
- **Workflows:** `WF-JOIN`
- **Components:** Identity Service, Frontend Client (`COMP` §13.1)
- **Data:** `DATA-SESSIONS` (`room_sessions.access_tier = listener`)
- **APIs:** `API-NICK` `POST /api/v1/rooms/:roomId/listen`
- **WebSockets:** `WS-CONN` `room.snapshot`; `WS-PLAYBACK` `playback.state` (read); `WS-QUEUE` `queue.updated` (read)
- **Security:** `SEC-TIER` (listener tier issued in token; read-only)
- **Errors:** `ROOM_PASSWORD_REQUIRED` (if room password-protected)
- **Acceptance:** `AC-V140-1`, `AC-JOIN-1`
- **Risks:** Listener confusion about disabled controls (§32)
- **Decisions:** DL-019, DL-020 (listener chat hidden default)

### FR-024 / FR-025 / FR-026 / FR-027 — Password lifecycle (§7.3)
- **Description:** No password reset in MVP (FR-024); UI must warn forgotten passwords are unrecoverable (FR-025, MVP); change password after re-auth (FR-026, Phase 2); release/delete claim (FR-027, Phase 2).
- **Implements:** `FEAT-NICKPROT`
- **Workflows:** `WF-PROTECT`
- **Components:** Identity Service, Frontend Client
- **Data:** `DATA-NICKNAMES`
- **APIs:** `API-NICK` (Phase 2 change/release endpoints)
- **WebSockets:** —
- **Security:** `SEC-PWD`
- **Errors:** `NICKNAME_PASSWORD_INCORRECT`
- **Acceptance:** `AC-JOIN-4` (rate-limited wrong password)
- **Risks:** Forgotten nickname passwords (§32, LIM-001)
- **Decisions:** DL-001

### FR-028 — Server-side rejection of interactive actions for non-members (§7.3, MVP) ★★ canonical gate
- **Description:** Server must reject every interactive action (chat, vote, react, add song, skip-vote, moderation, settings change) from a session not bound to an authenticated protected nickname, with a clear "protection required" error.
- **Implements:** `FEAT-NICKPROT`
- **Workflows:** all member-tier flows (`WF-ADDSONG`, chat, vote, `WF-STAFF*` native equivalents)
- **Components:** Auth Middleware, Chat/Queue/Moderation Services
- **Data:** `DATA-SESSIONS` (`room_sessions.access_tier`)
- **APIs:** `API-*` `POST /api/v1/rooms/:roomId/*` (all mutating routes), `API-NICK`
- **WebSockets:** `WS-C2S` (all client→server interactive events)
- **Security:** `SEC-TIER` — **must never be weakened**; tier from signed token (`accessTier`, §19.4), DB fallback when absent
- **Errors:** `NICKNAME_PROTECTION_REQUIRED` (409), `LISTENER_READ_ONLY` (403)
- **Acceptance:** `AC-V140-2`, `AC-V140-5` (cannot be bypassed by client manipulation)
- **Risks:** Listener privilege escalation (§19.1 #16)
- **Decisions:** DL-019; NFR-038

### FR-029 — Inline upgrade prompts for Listeners (§7.3, MVP)
- **Description:** Native UI must present a clear, low-friction claim/authenticate prompt wherever an interactive control would appear for a Listener, explaining protection unlocks participation.
- **Implements:** `FEAT-NICKPROT`, `FEAT-LISTEN`
- **Workflows:** `WF-JOIN`
- **Components:** Frontend Client
- **Data:** — (consumes tier from session)
- **APIs:** N/A (client UX; triggers `API-NICK` on action)
- **WebSockets:** —
- **Security:** `SEC-TIER` (client mirrors server gate; never authoritative)
- **Errors:** displays `LISTENER_READ_ONLY` / `NICKNAME_PROTECTION_REQUIRED` as prompts
- **Acceptance:** `AC-V140-2`
- **Risks:** Mandatory protection lowers conversion; listener confusion (§32, LIM-007)
- **Decisions:** DL-019

---

## Group 7.4 — YouTube Track Input (`FEAT-QUEUE`, `YT`)

### FR-030 / FR-031 / FR-032 — Add by URL, extract & validate ID, fetch metadata (§7.4, MVP)
- **Implements:** `FEAT-QUEUE`
- **Workflows:** `WF-ADDSONG`
- **Components:** Queue Engine, YouTube Metadata Service (`COMP` §13.8)
- **Data:** `DATA-QUEUE` (`queue_items`), `DATA-TRACKS` (`tracks`)
- **APIs:** `API-QUEUE` `POST /api/v1/rooms/:roomId/queue/items`
- **WebSockets:** `WS-QUEUE` `queue.item.added`, `queue.updated`
- **Security:** `SEC-TIER` (member); YouTube API key server-side only (§19.2); add-song cooldown 30s (App. A)
- **Errors:** `VIDEO_URL_INVALID` (400), `YOUTUBE_METADATA_DEGRADED` (503)
- **Acceptance:** `AC-QUEUE-1`, `AC-QUEUE-4`
- **Risks:** YouTube quota exhaustion (§32) → `ERR-CIRCUIT` YouTube breaker
- **Decisions:** —

### FR-033 / FR-034 / FR-037 — Duration limit, duplicate rejection, unavailable handling (§7.4, MVP)
- **Implements:** `FEAT-QUEUE`
- **Workflows:** `WF-ADDSONG`
- **Components:** Queue Engine, YouTube Metadata Service
- **Data:** `DATA-QUEUE`, `DATA-TRACKS` (`tracks.metadata_status`), `DATA-ROOMS` (`max_song_duration_seconds`)
- **APIs:** `API-QUEUE` `POST /api/v1/rooms/:roomId/queue/items`
- **WebSockets:** `WS-QUEUE` `queue.item.added` (or rejection ack)
- **Security:** `SEC-TIER`
- **Errors:** `VIDEO_TOO_LONG` (422), `DUPLICATE_VIDEO` (409), `VIDEO_UNAVAILABLE` (422)
- **Acceptance:** `AC-QUEUE-2`, `AC-QUEUE-3`
- **Risks:** YouTube embed restrictions (§32) → mark failed / skip
- **Decisions:** Defaults: max duration 10 min, block-if-queued (App. A)

### FR-035 / FR-036 — In-app search, playlist import (§7.4, Phase 2)
- **Implements:** `FEAT-QUEUE`
- **Components:** YouTube Metadata Service
- **Data:** `DATA-TRACKS`
- **APIs:** `API-QUEUE` (Phase-2 search endpoint)
- **Security:** YouTube API key server-side; search disabled while YouTube breaker open (§23.6)
- **Errors:** `YOUTUBE_METADATA_DEGRADED`
- **Acceptance:** — (Phase 2)
- **Risks:** YouTube quota (§32)
- **Decisions:** —

---

## Group 7.5 — Playback (`FEAT-PLAYBACK`, `SYNC`)

### FR-040 / FR-041 / FR-045 — Authoritative state, client receipt, resync (§7.5, MVP)
- **Description:** One authoritative current-track state (FR-040); clients receive track/status/approx position (FR-041); periodic/state-change resync (FR-045).
- **Implements:** `FEAT-PLAYBACK`
- **Workflows:** `WF-NOWPLAYING`, `WF-JOIN`
- **Components:** Playback Coordinator (`COMP` §13.5)
- **Data:** `DATA-QUEUE` (`queue_items` state/started/ended)
- **APIs:** — (state delivered via WS; snapshot via embed `GET /api/v1/rooms/:roomId/.../snapshot`)
- **WebSockets:** `WS-PLAYBACK` `playback.state`, `playback.resync`, `room.snapshot` (on connect)
- **Security:** server-authoritative (`ARCH` §12 server authority); read-only for listeners (`SEC-TIER`)
- **Errors:** `TRACK_NOT_FOUND`
- **Acceptance:** `AC-PLAY-1`, `AC-PLAY-2`
- **Risks:** Playback drift (§32, LIM-004)
- **Decisions:** DL-010 (3s sync target → NFR-003)

### FR-042 / FR-043 — Host/mod skip; skip-vote (§7.5, MVP)
- **Implements:** `FEAT-PLAYBACK`, `FEAT-MOD`
- **Workflows:** `WF-STAFFSKIP` (native host skip)
- **Components:** Playback Coordinator, Moderation Service (`COMP` §13.7)
- **Data:** `DATA-QUEUE`, `DATA-SKIPVOTES` (`skip_votes`), `DATA-MODACTIONS`
- **APIs:** `API-QUEUE`/playback `POST /api/v1/rooms/:roomId/playback/skip`, `.../playback/skip-vote`
- **WebSockets:** `WS-PLAYBACK` `playback.skipVote`, `playback.state` (on advance)
- **Security:** `SEC-TIER` (member to vote; `MODERATOR_REQUIRED`/`HOST_REQUIRED` to force-skip)
- **Errors:** `MODERATOR_REQUIRED` (403), `VOTE_NOT_ALLOWED` (403)
- **Acceptance:** `AC-PLAY-3`
- **Risks:** —
- **Decisions:** Skip threshold default 50% / min 2 (App. A)

### FR-044 / FR-046 — Auto-advance; playback-failure handling (§7.5, MVP)
- **Implements:** `FEAT-PLAYBACK`
- **Workflows:** `WF-NOWPLAYING`, veto cycle (`WF-VETO-*`)
- **Components:** Playback Coordinator, Queue Engine
- **Data:** `DATA-QUEUE` (`queue_items` state)
- **APIs:** —
- **WebSockets:** `WS-PLAYBACK` `playback.clientState` (client→server), `playback.state`; `WS-QUEUE` `queue.item.veto_window.opened` (when veto enabled)
- **Security:** server-authoritative advance
- **Errors:** `VIDEO_UNAVAILABLE`
- **Acceptance:** `AC-PLAY-4`
- **Risks:** YouTube embed restrictions (§32)
- **Decisions:** DL-014 (play last candidate on veto exhaustion)

---

## Group 7.6 — Playlist Mechanics (`FEAT-MECHANICS`, `ALGO`)

### FR-050…FR-054 — Mechanic modes (§7.6)
- **Description:** FIFO (FR-050, MVP), voting (FR-051, MVP), DJ rotation (FR-052, MVP/Phase 2), host-curated (FR-053, MVP), moderated suggestion (FR-054, Phase 2).
- **Implements:** `FEAT-MECHANICS`, `FEAT-QUEUE`
- **Workflows:** `WF-ADDSONG`, `WF-MECHCHANGE`
- **Components:** Queue Engine (`ALGO` §17 selection)
- **Data:** `DATA-QUEUE` (`position`, `score`), `DATA-VOTES` (`queue_votes`), `DATA-ROOMS` (`playlist_mechanic`)
- **APIs:** `API-QUEUE` `POST /api/v1/rooms/:roomId/queue/items`, vote endpoint
- **WebSockets:** `WS-QUEUE` `queue.updated`, `queue.vote.updated`
- **Security:** `SEC-TIER`; DJ-rotation depends on presence (FR-092)
- **Errors:** `QUEUE_LOCKED`, `VOTE_NOT_ALLOWED`
- **Acceptance:** `AC-QUEUE-4`, `AC-MECH-4`
- **Risks:** —
- **Decisions:** DL-006 (upvote-only MVP), DL-007 (no default suggestions host-curated)

### FR-055…FR-060 — Mechanic changes (§7.6, MVP+) ★
- **Description:** Host changes mechanic post-creation (FR-055); no current-song interruption (FR-056); change announced as system chat (FR-057); queue order preserved by default (FR-058); optional recalc/clear with confirmation (FR-059, Phase 2); public-room change cooldown (FR-060).
- **Implements:** `FEAT-MECHANICS`
- **Workflows:** `WF-MECHCHANGE`
- **Components:** Room Service, Queue Engine, Playback Coordinator, Chat Service
- **Data:** `DATA-ROOMS` (`playlist_mechanic`), `DATA-SETTINGSHIST` (`room_settings_history`)
- **APIs:** `API-ROOMS` `PATCH /api/v1/rooms/:roomId/settings`
- **WebSockets:** `WS-S2C` `room.mechanic.changed`, `chat.message` (system)
- **Security:** `HOST_REQUIRED`; public-room cooldown (default 5 min, App. A)
- **Errors:** `MECHANIC_CHANGE_COOLDOWN` (429), `HOST_REQUIRED` (403)
- **Acceptance:** `AC-MECH-1`…`AC-MECH-6`
- **Risks:** —
- **Decisions:** — (sequence diagram §12.6)

---

## Group 7.7 — Chat (`FEAT-CHAT`)

### FR-070 / FR-072 / FR-073 / FR-074 — Real-time chat, metadata, rate limit, system messages (§7.7, MVP)
- **Implements:** `FEAT-CHAT`
- **Workflows:** chat send/receive (member tier)
- **Components:** Chat Service (`COMP` §13.6), Rate Limit Service
- **Data:** `DATA-CHAT` (`chat_messages`)
- **APIs:** `API-CHAT` `GET /api/v1/rooms/:roomId/chat/messages?before=&limit=` (history)
- **WebSockets:** `WS-CHAT` `chat.send` (C2S), `chat.message` (S2C)
- **Security:** `SEC-TIER` (member to send); sanitization (XSS, §19.2); chat rate limit 5 msg / 10s (App. A, FR-073)
- **Errors:** `RATE_LIMITED` (429), `CHAT_LOCKED` (403), `MUTED` (403)
- **Acceptance:** `AC-CHAT-1`, `AC-CHAT-4`, `AC-CHAT-5`
- **Risks:** Chat spam; XSS (§19.1)
- **Decisions:** DL-004 (100-message history)

### FR-071 / FR-078 — Listener chat restriction & visibility (§7.7, MVP) ★
- **Description:** Listeners cannot send chat (FR-071); `listener_chat_visible` per-room controls whether Listeners can read chat, default hidden (FR-078).
- **Implements:** `FEAT-CHAT`, `FEAT-LISTEN`
- **Workflows:** `WF-JOIN`
- **Components:** Chat Service
- **Data:** `DATA-ROOMS` (`rooms.listener_chat_visible`), `DATA-SESSIONS` (`access_tier`)
- **APIs:** `API-ROOMS` `PATCH /api/v1/rooms/:roomId/settings` (toggle visibility)
- **WebSockets:** `WS-CHAT` (server filters delivery by tier + setting)
- **Security:** `SEC-TIER`
- **Errors:** `LISTENER_READ_ONLY` (on send attempt)
- **Acceptance:** `AC-CHAT-2`, `AC-V140-6`
- **Risks:** Listener confusion (§32)
- **Decisions:** DL-020 (listener chat hidden default)

### FR-075 / FR-076 / FR-077 — Delete messages, mute, reactions (§7.7)
- **Implements:** `FEAT-CHAT`, `FEAT-MOD`
- **Components:** Moderation Service, Chat Service
- **Data:** `DATA-CHAT` (`deleted_at`), `DATA-SESSIONS` (`is_muted`)
- **APIs:** `API-CHAT` `DELETE /api/v1/rooms/:roomId/chat/messages/:messageId`; `API-MOD` mute
- **WebSockets:** `WS-CHAT` `chat.deleted`; `WS-MOD` `moderation.applied`
- **Security:** `MODERATOR_REQUIRED`
- **Errors:** `MODERATOR_REQUIRED`, `CHAT_MESSAGE_NOT_FOUND` (404)
- **Acceptance:** `AC-CHAT-3`
- **Risks:** —
- **Decisions:** — (FR-077 reactions Phase 2)

---

## Group 7.8 — Moderation (`FEAT-MOD`, `MOD-NATIVE`)

### FR-080…FR-088 — Host moderation suite (§7.8)
- **Description:** Mute (FR-080), ban via session/device/IP identifiers (FR-081), remove queue items (FR-082), skip (FR-083), assign/revoke moderator (FR-084, Phase 2), audit logging (FR-085), slow mode (FR-086, Phase 2), lock queue (FR-087), lock chat (FR-088, Phase 2).
- **Implements:** `FEAT-MOD`
- **Workflows:** native moderation (analogue of `WF-STAFFRM`/`WF-STAFFSKIP`)
- **Components:** Moderation Service (`COMP` §13.7)
- **Data:** `DATA-MODACTIONS` (`room_moderation_actions`), `DATA-SESSIONS` (`is_muted`/`is_banned`), `DATA-CHAT`, `DATA-QUEUE`
- **APIs:** `API-MOD` `POST /api/v1/rooms/:roomId/moderation/{mute,unmute,ban,unban,assign-moderator,revoke-moderator}`
- **WebSockets:** `WS-MOD` `moderation.action` (C2S), `moderation.applied` (S2C); system `chat.message`
- **Security:** `HOST_REQUIRED`/`MODERATOR_REQUIRED`; server-side role check on every write (§19.2); audit logging (NFR-067, §24.2)
- **Errors:** `MODERATOR_REQUIRED`, `HOST_REQUIRED`, `BANNED`, `MUTED`, `QUEUE_LOCKED`, `CHAT_LOCKED`
- **Acceptance:** `AC-CHAT-3`, (moderation actions per `MOD-NATIVE`)
- **Risks:** Unauthorized moderator/host actions (§19.1 #7)
- **Decisions:** —

---

## Group 7.9–7.10 — Presence & Room Settings (`FEAT-PRESENCE`, `FEAT-ROOMSETTINGS`)

### FR-090 / FR-091 / FR-092 — Presence (§7.9, MVP)
- **Implements:** `FEAT-PRESENCE`
- **Components:** Socket.IO Gateway, Presence Manager, Frontend Client, Identity/Nickname session flow
- **Data:** Redis (presence ZSET), `DATA-SESSIONS` (`room_sessions`)
- **APIs:** `POST /api/v1/rooms/:roomId/listen` (bootstrap/rehydration), `POST /api/v1/rooms/:roomId/join` (in-place upgrade)
- **WebSockets:** `WS-PRESENCE` `presence.heartbeat` (C2S), `presence.updated` (S2C); `WS-CONN` `room.snapshot` (S2C)
- **Security:** `SEC-TIER` (tier validated server-side from signed token); presence falls back to DB if Redis degraded
- **Errors:** `SERVICE_DEGRADED` (Redis offline fallback logged)
- **Acceptance:** `AC-PRESENCE-1` to `AC-PRESENCE-9` (§31.10)
- **Risks:** Redis unavailability → DB index query/cleanup fallback bounds approximation to 60s
- **Decisions:** — (DJ-rotation eligibility FR-092 depends on presence)

### FR-100…FR-106 — Room settings (§7.10)
- **Implements:** `FEAT-ROOMSETTINGS`
- **Workflows:** `WF-MECHCHANGE` (and settings edits)
- **Components:** Room Service
- **Data:** `DATA-ROOMS`, `DATA-SETTINGSHIST`
- **APIs:** `API-ROOMS` `PATCH /api/v1/rooms/:roomId/settings`
- **WebSockets:** `WS-S2C` `room.settings.changed`
- **Security:** `HOST_REQUIRED`; room password hash (`SEC-PWD`, FR-106 Phase 2)
- **Errors:** `HOST_REQUIRED`, `VALIDATION_FAILED`
- **Acceptance:** `AC-MECH-6` (settings history)
- **Risks:** —
- **Decisions:** —

---

## Group 7.11 — External Site Embeds & Integrations (`FEAT-EMBED`, `FEAT-EXTCMD`) — defer security to `SEC-EXTINTEG`

### FR-110 / FR-111 — Create integration; define origins/channel/prefix/webhook/commands (§7.11)
- **Implements:** `FEAT-EXTCMD`, `FEAT-EMBED`
- **Workflows:** `WF-EXTSETUP`
- **Components:** External Command Service (`COMP` §13.11), Room Service
- **Data:** `DATA-INTEGRATIONS` (`site_integrations`), `DATA-EXTCONFIG` (`external_chat_music` JSONB)
- **APIs:** `API-INTEG` `POST /api/v1/rooms/:roomId/integrations/site`, `PATCH`/`DELETE .../integrations/site/:integrationId`
- **WebSockets:** `WS-INTEG` `room.external_settings.changed`
- **Security:** **`SEC-EXTINTEG` (authoritative, §19.5)** — one-time secret material, public token ≠ secret; `SEC-CORS` per-integration `allowed_origins`
- **Errors:** `EXTERNAL_INTEGRATION_NOT_FOUND`, `VALIDATION_FAILED`
- **Acceptance:** `AC-EXT-1`, `AC-EXT-2`
- **Risks:** Embed secret leakage (§32)
- **Decisions:** DL-011 (external MVP should-have), DL-012 (per-integration-per-room scope), DL-018 (unique command prefix)

### FR-112 / FR-113 — Read-only embed view (§7.11)
- **Implements:** `FEAT-EMBED`
- **Workflows:** embed render (consumes snapshot)
- **Components:** Embeddable Room Client (`COMP` §13.10)
- **Data:** read-only snapshot of `DATA-ROOMS`/`DATA-QUEUE`/`DATA-VETOWIN`
- **APIs:** `API-INTEG` `GET /api/v1/embed/rooms/:roomSlug`, `GET .../embed/rooms/:roomSlug/snapshot`
- **WebSockets:** `WS-S2C` read-only subscription
- **Security:** `SEC-CSP` (dynamic `frame-ancestors` per integration, §19.6.4), `SEC-FRAME`; no secrets in embed (§19.6.4)
- **Errors:** `ROOM_NOT_FOUND`
- **Acceptance:** `AC-EXT-3`
- **Risks:** Secret leakage via iframe URLs (§19.1 #15)
- **Decisions:** Default embed mode `player_and_queue_readonly` (App. A)

### FR-114 / FR-115 / FR-116 — Server-to-server commands & inbound auth (§7.11, MVP) ★
- **Description:** Embed must not accept votes/requests/staff actions without authenticated server-side identity (FR-114); external commands via S2S endpoint (FR-115); verify inbound integration auth before processing (FR-116).
- **Implements:** `FEAT-EXTCMD`
- **Workflows:** `WF-EXTSR`, `WF-EXTVOTE`
- **Components:** External Command Service
- **Data:** `DATA-INTEGRATIONS`, `DATA-EXTCMD` (`external_commands`)
- **APIs:** `API-INTEG` `POST /api/v1/integrations/site-command`
- **WebSockets:** `WS-INTEG` `integration.command.received/accepted/rejected`
- **Security:** **`SEC-EXTINTEG` (§19.5)** — HMAC/bearer, timestamp freshness, replay protection, idempotency, strict schema validation
- **Errors:** `INTEGRATION_AUTH_INVALID` (401), `EXTERNAL_COMMAND_REPLAY` (409), `INVALID_COMMAND_SYNTAX` (400)
- **Acceptance:** `AC-EXT-4`, `AC-EXT-5`
- **Risks:** Forged external commands; replay (§19.1 #11, #12)
- **Decisions:** DL-015 (optional trust signals)

### FR-117 / FR-118 / FR-119 — External participant mapping; signed outbound; user-facing results (§7.11)
- **Implements:** `FEAT-EXTCMD`
- **Workflows:** `WF-EXTSR`, `WF-EXTVOTE`
- **Components:** External Command Service, Outbound Bot Webhook Service (`COMP` §13.12)
- **Data:** `DATA-EXTPART` (`external_participants`), `DATA-EXTREF` (`external_references`)
- **APIs:** `API-INTEG` `POST /api/v1/integrations/site-command` (+ outbound webhook egress)
- **WebSockets:** `WS-INTEG` `external.bot_message.created`
- **Security:** **`SEC-EXTINTEG`** — signed outbound webhooks; sanitization of names/text/refs
- **Errors:** `WEBHOOK_DELIVERY_DEFERRED` (503)
- **Acceptance:** `AC-EXT-6`, `AC-EXT-7`, `AC-EXT-8`
- **Risks:** Webhook failure; external identity instability (§32)
- **Decisions:** DL-012, DL-015, DL-017 (webhook retry/DLQ)

---

## Group 7.12 — Pre-Play Veto (`FEAT-VETO`, `MECH`, `ALGO`)

### FR-130…FR-143 — Pre-play veto lifecycle (§7.12, MVP/Phase 2) ★
- **Description:** Enable veto (FR-130); open only pre-playback (FR-131) and only with ≥1 alternate (FR-132); no alternate → play normally (FR-133); `!yay` keep (FR-134) / `!nay` veto (FR-135); one active vote/candidate (FR-136), changeable (FR-137); net nays = nay−yay (FR-138); vetoed at threshold (FR-139); fixed/percentage/hybrid thresholds (FR-140); results announced (FR-141); vetoed items marked distinctly (FR-142); window closes without veto → play (FR-143).
- **Implements:** `FEAT-VETO`
- **Workflows:** `WF-VETOANNOUNCE`, `WF-EXTVOTE`, `WF-VETO-VETOED`, `WF-VETO-PASSED`
- **Components:** Queue Engine (veto logic, `ALGO` §17.6), Playback Coordinator
- **Data:** `DATA-VETOVOTES` (`preplay_veto_votes`), `DATA-VETOWIN` (`preplay_veto_windows`), `DATA-QUEUE` (`queue_items` state)
- **APIs:** `API-INTEG` `POST /api/v1/integrations/site-command` (`!yay`/`!nay`)
- **WebSockets:** `WS-QUEUE` `queue.item.veto_window.opened/.updated`, `queue.item.vetoed`, `queue.item.veto_passed`; `WS-PLAYBACK` `playback.state`
- **Security:** one vote per stable external user ID (`MOD-EXTVOTE`, §19.2); requester eligibility (DL-013)
- **Errors:** `NO_VETO_OPEN` (422), `NO_ALTERNATE_FOR_VETO` (422), `VETO_WINDOW_CLOSED` (409), `VOTE_NOT_ALLOWED` (403)
- **Acceptance:** `AC-VETO-1`…`AC-VETO-7`
- **Risks:** Veto abuse; external identity instability (§32)
- **Decisions:** DL-013 (requester votes allowed), DL-014 (play last candidate on exhaustion); defaults: 20s window, hybrid 25%/min-3 net nays (App. A); sequence diagram §12.6

---

## Group 7.13 — External Staff Commands & Song Request Policy (`FEAT-EXTSTAFF`, `FEAT-SRPOLICY`, `FEAT-EXTMUTE`)

### FR-150 / FR-151 / FR-156 — Staff definition, server-side authz, audit (§7.13) ★
- **Implements:** `FEAT-EXTSTAFF`
- **Workflows:** `WF-STAFFRM`, `WF-STAFFSKIP`, `WF-STAFFPOLICY`
- **Components:** External Command Service, Moderation Service
- **Data:** `DATA-INTEGRATIONS` (staff allowlist/role map), `DATA-EXTCMD`, `DATA-MODACTIONS`
- **APIs:** `API-INTEG` `POST /api/v1/integrations/site-command`
- **WebSockets:** `WS-INTEG` `external.bot_message.created`
- **Security:** **`SEC-EXTINTEG`** — server-side allowlist / trusted role mapping, no client-side trust; audit log accepted+rejected privileged commands
- **Errors:** `EXTERNAL_COMMAND_UNAUTHORIZED` (403), `EXTERNAL_ROLE_UNTRUSTED` (403)
- **Acceptance:** `AC-STAFF-1`, `AC-STAFF-5`
- **Risks:** External role spoofing; staff role spoofing (§19.1 #13, §32)
- **Decisions:** DL-016 (Phase-2 staff confirmation)

### FR-152 / FR-153 / FR-154 / FR-155 / FR-162 — Staff mutations (§7.13)
- **Description:** Remove by reference (FR-152) / by URL (FR-153); force skip (FR-154); change music settings via command (FR-155); changes persist + broadcast (FR-162).
- **Implements:** `FEAT-EXTSTAFF`
- **Workflows:** `WF-STAFFRM`, `WF-STAFFSKIP`, `WF-STAFFPOLICY`
- **Components:** External Command Service, Queue Engine, Playback Coordinator, Room Service
- **Data:** `DATA-QUEUE`, `DATA-EXTREF`, `DATA-ROOMS`, `DATA-SETTINGSHIST`
- **APIs:** `API-INTEG` `POST /api/v1/integrations/site-command`
- **WebSockets:** `WS-QUEUE` `queue.item.removed`; `WS-PLAYBACK` `playback.state`; `WS-INTEG` `room.external_settings.changed`
- **Security:** **`SEC-EXTINTEG`**; audit + announce
- **Errors:** `QUEUE_ITEM_NOT_FOUND` (404), `EXTERNAL_COMMAND_UNAUTHORIZED`
- **Acceptance:** `AC-STAFF-2`, `AC-STAFF-3`, `AC-STAFF-4`
- **Risks:** Staff abuse (§20.3 `MOD-EXTSTAFF`)
- **Decisions:** —

### FR-157…FR-161 — Song request policy modes (§7.13)
- **Description:** Modes open / per-user-cooldown / after-user-song-finishes / staff-only / closed (FR-157); cooldown by external user ID (FR-158); no stacking accepted songs (FR-159); staff-only restriction (FR-160); closed rejects all (FR-161).
- **Implements:** `FEAT-SRPOLICY`
- **Workflows:** `WF-EXTSR`, `WF-STAFFPOLICY`
- **Components:** External Command Service, Queue Engine, Rate Limit Service
- **Data:** `DATA-EXTCONFIG` (`songRequestPolicy` JSONB on `rooms`), `DATA-EXTPART`, `DATA-QUEUE`
- **APIs:** `API-INTEG` `POST /api/v1/integrations/site-command` (`!sr`, policy commands)
- **WebSockets:** `WS-INTEG` `external.bot_message.created`
- **Security:** **`SEC-EXTINTEG`**; per-user cooldown (default 90s, App. A); max pending 2, max queue 50
- **Errors:** `SONG_REQUEST_POLICY_CLOSED` (403), `SONG_REQUEST_COOLDOWN` (429), `MAX_PENDING_PER_USER_REACHED` (409), `QUEUE_FULL` (409)
- **Acceptance:** `AC-EXT-6`, `AC-STAFF-4`
- **Risks:** Queue abuse (§20.3 `MOD-EXTQUEUE`)
- **Decisions:** Note: §14.2 `songRequestPolicy.mode` enum (`open|cooldown|allowlist|closed`) vs §11.10 product modes — see plan §1.4 discrepancy log.

### FR-163…FR-168 — External participant muting (§7.13) ★
- **Description:** Staff mute external participant (FR-163); duration units `Ns/Nm/Nh/Nd`/permanent (FR-164); timed auto-expiry restores rights (FR-165); early unmute (FR-166); mute/unmute audited+announced (FR-167); muted users keep read-only `!song`/`!queue` but blocked from `!sr`/`!yay`/`!nay` (FR-168).
- **Implements:** `FEAT-EXTMUTE`
- **Workflows:** `WF-STAFFMUTE`, `WF-STAFFUNMUTE`, `WF-MUTEEXPIRE`
- **Components:** External Command Service, Moderation Service
- **Data:** `DATA-EXTPART` (mute fields), `DATA-MODACTIONS`
- **APIs:** `API-INTEG` `POST /api/v1/integrations/site-command` (`!music mute/unmute`)
- **WebSockets:** `WS-INTEG` `external.bot_message.created`
- **Security:** **`SEC-EXTINTEG`**; rate-limit + audit + explicit duration (`MOD-EXTMUTE`, §20.3); lazy TTL check on next command + periodic cleanup (§10.18)
- **Errors:** `EXTERNAL_USER_MUTED` (403)
- **Acceptance:** `AC-STAFF-8`, `AC-STAFF-9`, `AC-STAFF-10`, `AC-STAFF-11`
- **Risks:** Mute abuse / accidental permanent mute; TTL auto-expiry race (§32)
- **Decisions:** —

---

## Group 7.14 — External Abuse Prevention & Integration Security (`SEC-EXTINTEG` authoritative)

### FR-170…FR-179 — Integration security & abuse prevention (§7.14, MVP) ★★
- **Description:** Inbound auth + replay protection (FR-170); idempotent duplicate handling (FR-171); integration/room/user/command rate limits (FR-172); SR policy enforcement: queue size/pending/duration/duplicate/blocked-content (FR-173); one vote per eligible external user (FR-174); sanitize names + command text (FR-175); signed outbound webhooks (FR-176); audit privileged commands (FR-177); embed origins restricted to allowlist (FR-178); server-side secrets never exposed to browser (FR-179).
- **Implements:** `FEAT-EXTCMD`, `FEAT-EMBED`, `FEAT-SRPOLICY`, `FEAT-VETO`
- **Workflows:** `WF-EXTSR`, `WF-EXTVOTE`, `WF-EXTSETUP`
- **Components:** Rate Limit Service, External Command Service, Outbound Bot Webhook Service
- **Data:** `DATA-EXTCMD` (idempotency), `DATA-EXTPART`, `DATA-INTEGRATIONS`, Redis (rate limits)
- **APIs:** `API-INTEG` `POST /api/v1/integrations/site-command`, embed endpoints
- **WebSockets:** `WS-INTEG` `integration.command.rejected`
- **Security:** **`SEC-EXTINTEG` (§19.5) — authoritative for ALL of this group**; defense-in-depth list items 1–13; `SEC-CORS`/`SEC-CSP`/`SEC-FRAME` for embeds
- **Errors:** `INTEGRATION_AUTH_INVALID`, `EXTERNAL_COMMAND_REPLAY`, `EXTERNAL_COMMAND_DUPLICATE`, `RATE_LIMITED`, `VALIDATION_FAILED`
- **Acceptance:** `AC-EXT-4`, `AC-EXT-5`, `AC-STAFF-6`, `AC-STAFF-7`
- **Risks:** Forged commands, replay, role spoofing, vote manipulation, secret leakage (§19.1 #11–15)
- **Decisions:** DL-015 (trust signals), DL-017 (webhook retry/DLQ), DL-018 (unique prefix); NFR-060–069

---

## Reverse index — "What touches X?"

| Entity | Requirements that touch it |
| --- | --- |
| `DATA-SESSIONS` (`room_sessions`) | FR-010, FR-019, FR-028, FR-076, FR-090 (+ every gated FR via `SEC-TIER`) |
| `DATA-NICKNAMES` (`nickname_claims`) | FR-010, FR-012, FR-014, FR-015, FR-020, FR-021, FR-022, FR-024–027 |
| `DATA-QUEUE` (`queue_items`) | FR-030–034, FR-040–044, FR-050–058, FR-082, FR-130–143, FR-152–154, FR-173 |
| `DATA-EXTCMD` (`external_commands`) | FR-115–117, FR-150–168, FR-170–177 |
| `DATA-VETOWIN`/`DATA-VETOVOTES` | FR-130–143, FR-174 |
| `API-NICK` (`/listen`,`/join`,protect/auth) | FR-010, FR-014–017, FR-019–023, FR-028 |
| `API-INTEG` (`/integrations/site-command`) | FR-114–119, FR-130–143, FR-150–168, FR-170–179 |
| `WS-PLAYBACK` events | FR-040–046, FR-130–143 (advance), FR-154 |
| `SEC-TIER` gate | FR-010, FR-019, FR-028, FR-071, FR-078 + all native member actions |
| `SEC-EXTINTEG` (§19.5) | FR-114, FR-116, FR-150–151, FR-156, FR-170–179 |
| `ERR-REGISTRY` `LISTENER_READ_ONLY`/`NICKNAME_PROTECTION_REQUIRED` | FR-010, FR-028, FR-029, FR-071 |
