# trackstacc-security-controls.md

> **Engineering Knowledge-Graph Layer — Deliverable 5 of 7**
> Every security control extracted from the SDD, assigned a stable `SEC-NNN` ID, with the threat it addresses, components it protects, implementation location, verification method, and links to requirements, acceptance criteria, and risks.
> Spine: SDD §19 (threat model 19.1, mitigations 19.2, password 19.3, sessions 19.4, external 19.5, CORS/CSP 19.6), §20.3 (external abuse controls), §23.4/23.6 (errors + breakers), §24.2 (audit logging), App. A (defaults).
> `SEC-NNN` IDs are **additive** and coexist with the area IDs (`SEC-TIER`, `SEC-EXTINTEG`, `SEC-PWD`, `SEC-CORS`, `SEC-CSP`, `SEC-FRAME`, `SEC-SESSION`) defined in `trackstacc-ai-documentation-plan.md` §2.8. The area-ID column maps each numbered control back to that scheme.

**Authority reminders:** `SEC-014`–`SEC-024` (external-integration controls) are governed authoritatively by **§19.5 (`SEC-EXTINTEG`)** — downstream sections (§12.4, §13.11, §20.3, §31.7, §31.9) reference it; on conflict, §19.5 wins. `SEC-001` (the native tier gate) **must never be weakened**.

---

## 1. Threat → control coverage (SDD §19.1, 16 threats)

| #   | Threat (§19.1)                         | Primary control(s)                         |
| --- | -------------------------------------- | ------------------------------------------ |
| 1   | Nickname impersonation                 | `SEC-005`                                  |
| 2   | Protected nickname brute force         | `SEC-004`, `SEC-006`                       |
| 3   | Room host secret leakage               | `SEC-003`                                  |
| 4   | Chat spam                              | `SEC-006`, `SEC-011`                       |
| 5   | Queue spam                             | `SEC-006`, `SEC-011`                       |
| 6   | XSS (chat/nickname/room name/metadata) | `SEC-007`, `SEC-012`                       |
| 7   | Unauthorized moderator/host actions    | `SEC-002`, `SEC-011`                       |
| 8   | WebSocket event forgery                | `SEC-008`, `SEC-002`                       |
| 9   | Abuse via public rooms                 | `SEC-006`, `SEC-011`, `SEC-013`, `SEC-020` |
| 10  | API key exposure                       | `SEC-009`                                  |
| 11  | Forged external chat commands          | `SEC-014`, `SEC-021`                       |
| 12  | Replay / duplicate external delivery   | `SEC-015`, `SEC-016`                       |
| 13  | External role spoofing                 | `SEC-017`                                  |
| 14  | Vote manipulation (unstable identity)  | `SEC-018`                                  |
| 15  | Secret leakage via iframe/JS           | `SEC-019`, `SEC-022`                       |
| 16  | Listener-tier privilege escalation     | `SEC-001`                                  |

---

## 2. Control matrix

### SEC-001 — Native access-tier enforcement (listener gate) ★ must never weaken

- **Area ID:** `SEC-TIER`
- **Threat Addressed:** Listener-tier privilege escalation (§19.1 #16)
- **Components Protected:** Auth Middleware, every domain service handling a native mutation; all `WS-C2S` events; privacy-sensitive REST reads (`GET /api/rooms/:roomId/chat/messages`); realtime chat delivery channel
- **Implementation Location:** access tier encoded in signed session token (`WsTokenPayload.accessTier`, §19.4); re-derived server-side on every REST request and WS event; DB fallback to `room_sessions.access_tier` when token field absent (§14.2). Shared guard primitives in `apps/api/src/auth/guards.ts` (REST) and `apps/api/src/realtime/guards.ts` (WebSocket). REST guards integrated into all mutating route handlers. WebSocket guard in `apps/api/src/realtime/room.gateway.ts` `onAny` dispatch. Privacy-sensitive REST reads (`GET /api/rooms/:roomId/chat/messages`) check that the session's roomId matches the URL path (`session.roomId === roomId`) and filter returned history to `[]` for listeners if `listenerChatVisible` is disabled. Realtime chat delivery enforces the same boundary via Socket.IO channel segmentation (`broadcast()` in `broadcast.ts` routes `chat.message`/`chat.deleted` to `room:${roomId}:chat`; listeners only join that sub-channel when `listenerChatVisible` allows it).
- **Verification Method:** Unit: `apps/api/src/__tests__/tier-guards.test.ts` (18 tests); REST integration: `apps/api/src/__tests__/tier-gate-rest.test.ts` (19 tests); WebSocket integration: `apps/api/src/__tests__/tier-gate-realtime.test.ts` (16 tests); acceptance: `apps/api/src/__tests__/tier-gate-acceptance.test.ts` (34 tests). See Issue #41.
- **Related Requirements:** FR-010, FR-019, FR-028, NFR-038
- **Related Acceptance:** `AC-V140-2`, `AC-V140-5`
- **Related Risks:** Listener privilege escalation (§32)
- **Errors:** `LISTENER_READ_ONLY` (403), `NICKNAME_PROTECTION_REQUIRED` (409), `FORBIDDEN` (403, room mismatch), `AUTH_REQUIRED` (401)

### SEC-002 — Server-side authorization on every write

- **Area ID:** `SEC-TIER` / role checks (§19.2)
- **Threat Addressed:** Unauthorized moderator/host actions (#7); event forgery (#8)
- **Components Protected:** Room, Queue, Chat, Moderation, Playback, External Command services
- **Implementation Location:** role/permission check in each service write path; never trust client-asserted role (§19.2 "Unauthorized actions")
- **Verification Method:** Unit: auth checks; Integration: permission-matrix tests (§37.1 NFR-030–035, §9.2 matrices)
- **Related Requirements:** FR-042, FR-075, FR-080–085, FR-151
- **Related Acceptance:** `AC-CHAT-3`, `AC-STAFF-1`
- **Related Risks:** Unauthorized actions (§19.1)
- **Errors:** `FORBIDDEN`, `HOST_REQUIRED`, `MODERATOR_REQUIRED`

### SEC-003 — Host secret hashing & rotation

- **Area ID:** `SEC-SESSION` / `SEC-PWD`
- **Threat Addressed:** Host secret leakage / room takeover (#3)
- **Components Protected:** Room Service, Identity Service
- **Implementation Location:** store only hash of host secret (`rooms.host_secret_hash`); rotation + nickname binding planned Phase 2 (§19.2, DL-002)
- **Verification Method:** Unit: host token; Integration: host claim (§37.1 FR-003)
- **Related Requirements:** FR-003
- **Related Acceptance:** `AC-RC-2`, `AC-V140-7`
- **Related Risks:** Host link leaked (§32)
- **Errors:** `HOST_REQUIRED`, `SESSION_INVALID`

### SEC-004 — Password storage (Argon2id)

- **Area ID:** `SEC-PWD`
- **Threat Addressed:** Brute force (#2); credential compromise
- **Components Protected:** Identity Service
- **Implementation Location:** `argon2id_hash(password, salt, memory, time, parallelism)` (§19.3); never store plaintext, never log, never return hash to client; min 10 chars (DL-009)
- **Verification Method:** Unit: password verify; Integration: protected join (§37.1 FR-021)
- **Related Requirements:** FR-021, NFR-030
- **Related Acceptance:** `AC-JOIN-3`
- **Related Risks:** Weak passwords (§19.2)
- **Errors:** `NICKNAME_PASSWORD_INCORRECT`

### SEC-005 — Nickname uniqueness & reserved-name blocking

- **Area ID:** `SEC-PWD` (claim integrity) / `COMP` §13.3
- **Threat Addressed:** Nickname impersonation (#1)
- **Components Protected:** Identity Service
- **Implementation Location:** room-level active-nickname uniqueness + global protected claims (DL-001); normalization (FR-012) preserving display casing (FR-013); reserved/offensive blocking (DL-008)
- **Verification Method:** Unit: nickname validation (§37.1 FR-012)
- **Related Requirements:** FR-011–013, FR-018
- **Related Acceptance:** `AC-JOIN-2`
- **Related Risks:** Impersonation (§19.1)
- **Errors:** `NICKNAME_TAKEN`, `NICKNAME_PROTECTED`

### SEC-006 — Rate limiting (native)

- **Area ID:** rate limiting (`COMP` §13.9)
- **Threat Addressed:** Brute force (#2), chat spam (#4), queue spam (#5), public-room abuse (#9)
- **Components Protected:** Rate Limit Service → Chat, Queue, Identity
- **Implementation Location:** Redis-backed counters; chat 5 msg/10s, add-song cooldown 30s, password-attempt limits by nickname/IP/global, mechanic-change cooldown 5 min public (App. A, §19.2); **fails closed when Redis down** (§23.6.2 #2)
- **Verification Method:** Unit: rate-limit calc; Integration: brute-force + spam (§37.1 FR-022, FR-073)
- **Related Requirements:** FR-022, FR-023, FR-073, FR-060, NFR-035
- **Related Acceptance:** `AC-JOIN-4`, `AC-CHAT-4`
- **Related Risks:** No-registration abuse (§32)
- **Errors:** `RATE_LIMITED`, `NICKNAME_PASSWORD_RATE_LIMITED`, `SONG_REQUEST_COOLDOWN`, `MECHANIC_CHANGE_COOLDOWN`

### SEC-007 — Output sanitization / escaping (XSS)

- **Area ID:** sanitization (§19.2) / `SEC-CSP`
- **Threat Addressed:** XSS via chat, nickname, room name, video metadata (#6)
- **Components Protected:** Chat Service, Room Service, External Command Service, Frontend/Embed Clients
- **Implementation Location:** escape all user content; sanitize markdown if added; sanitize external names/text/titles/refs (§19.2, §19.5 #7); paired with strict CSP (`SEC-012`)
- **Verification Method:** Integration: no sensitive/unsafe content in payloads; Security: CSP audit (§37.1 NFR-034/037)
- **Related Requirements:** FR-175, NFR-034
- **Related Acceptance:** `AC-CHAT-4`
- **Related Risks:** XSS (§32)
- **Errors:** `VALIDATION_FAILED`

### SEC-008 — Signed WebSocket tokens & session tokens

- **Area ID:** `SEC-SESSION`
- **Threat Addressed:** WebSocket event forgery (#8)
- **Components Protected:** Socket.IO Gateway, all realtime handlers
- **Implementation Location:** secure httpOnly SameSite cookies for browser sessions; short-lived signed WS tokens signed with `SESSION_SECRET`; rotate on privilege escalation; store token hashes if revocation needed (§19.4)
- **Verification Method:** WebSocket: token validation + reconnect (§37.1 NFR-022); Unit: token signing
- **Related Requirements:** FR-003, NFR-031, NFR-032
- **Related Acceptance:** `AC-RC-2`
- **Related Risks:** Event forgery (§19.1)
- **Errors:** `WEBSOCKET_TOKEN_INVALID`, `SESSION_INVALID`, `AUTH_REQUIRED`

### SEC-009 — Server-side YouTube API key isolation

- **Area ID:** secrets handling (§19.2)
- **Threat Addressed:** API key exposure (#10)
- **Components Protected:** YouTube Metadata Service
- **Implementation Location:** YouTube API key used server-side only for metadata/search; never shipped to browser (§19.2)
- **Verification Method:** Manual: compliance checklist (§37.1 NFR-050–053); Security: no key in client bundle
- **Related Requirements:** NFR-050–053
- **Related Acceptance:** — (YouTube compliance, §22)
- **Related Risks:** YouTube quota exhaustion (§32)
- **Errors:** `YOUTUBE_METADATA_DEGRADED`

### SEC-010 — Audit logging of privileged actions

- **Area ID:** audit logging (§24.2)
- **Threat Addressed:** Repudiation / unaccountable moderation (supports #7, #13)
- **Components Protected:** Moderation Service, External Command Service
- **Implementation Location:** `room_moderation_actions` + `external_commands` audit rows; structured logs with request/room/session-hash/action/error/latency (§24.2); accepted **and** rejected privileged commands logged (§19.5 #8)
- **Verification Method:** Integration: moderation/staff action audit (§37.1 FR-085, FR-156)
- **Related Requirements:** FR-085, FR-156, FR-167, FR-177, NFR-067
- **Related Acceptance:** `AC-STAFF-5`, `AC-STAFF-10`
- **Related Risks:** Staff/role abuse (§32)
- **Errors:** — (audit non-blocking; never logs secrets/passwords/tokens, §24.2)

### SEC-011 — Moderation controls (mute/ban/lock)

- **Area ID:** `MOD-NATIVE`
- **Threat Addressed:** Chat/queue spam (#4, #5), public-room abuse (#9), unauthorized participation
- **Components Protected:** Moderation Service → Chat, Queue
- **Implementation Location:** mute/ban via session/device/IP-derived identifiers where lawful (FR-081); queue/chat locks; slow mode (Phase 2) (§20.2)
- **Verification Method:** Integration: moderation actions (§37.1 FR-080–085)
- **Related Requirements:** FR-076, FR-080–088
- **Related Acceptance:** `AC-CHAT-3`, `AC-CHAT-4`
- **Related Risks:** No-registration abuse (§32)
- **Errors:** `MUTED`, `BANNED`, `CHAT_LOCKED`, `QUEUE_LOCKED`

### SEC-012 — Content Security Policy (native + embed)

- **Area ID:** `SEC-CSP`
- **Threat Addressed:** XSS (#6), secret/clickjacking via framing (#15)
- **Components Protected:** native pages, embed pages
- **Implementation Location:** strict native CSP with per-request nonce, `object-src 'none'`, `frame-ancestors 'self'` (§19.6.3); embed CSP with dynamic `frame-ancestors {integration_allowed_origins}` (§19.6.4); avoid `unsafe-inline`/`unsafe-eval`; report-only in staging, enforce in prod
- **Verification Method:** Security: CSP audit; monitor violations by route/integration/origin (§37.1 NFR-037)
- **Related Requirements:** NFR-037, FR-178, FR-179
- **Related Acceptance:** `AC-P1-3`, `AC-STAFF-7`
- **Related Risks:** XSS, secret leakage (§32)
- **Errors:** — (browser-enforced)

### SEC-013 — CORS deny-by-default with per-surface allowlists

- **Area ID:** `SEC-CORS`
- **Threat Addressed:** Cross-origin abuse, public-room abuse (#9)
- **Components Protected:** REST API, Socket.IO gateway, embed pages, external command endpoint
- **Implementation Location:** separate first-party vs embed allowlists; reject absent/non-allowlisted Origin; credentials only for first-party; never `ACAO: *` with credentials; minimal methods/headers; `Vary: Origin`; bounded `Access-Control-Max-Age` (§19.6.1–19.6.2)
- **Verification Method:** Integration: CORS validation (§37.1 NFR-037)
- **Related Requirements:** NFR-037, FR-178
- **Related Acceptance:** `AC-P1-3`
- **Related Risks:** Secret leakage / abuse (§32)
- **Errors:** rejected origins logged (no tokens/secrets/signatures, §19.6.2 #9)

### SEC-014 — Inbound external command authentication (HMAC/bearer + freshness) ★ §19.5 authoritative

- **Area ID:** `SEC-EXTINTEG`
- **Threat Addressed:** Forged external chat commands (#11)
- **Components Protected:** External Command Service
- **Implementation Location:** HMAC signature or bearer token verification + timestamp freshness window before parsing (§19.5 #1–2); headers `X-Trackstacc-Timestamp`/`X-Trackstacc-Signature` (§19.6.2)
- **Verification Method:** Integration: external command tests; Load: command burst (§37.1 NFR-060–069)
- **Related Requirements:** FR-116, FR-170
- **Related Acceptance:** `AC-EXT-4`
- **Related Risks:** Forged commands (§32)
- **Errors:** `INTEGRATION_AUTH_INVALID` (401)

### SEC-015 — Replay protection

- **Area ID:** `SEC-EXTINTEG`
- **Threat Addressed:** Replay of signed external payloads (#12)
- **Components Protected:** External Command Service
- **Implementation Location:** replay protection bound to timestamp window + message ID (§19.5 #2,#4)
- **Verification Method:** Integration: abuse scenarios (§37.1 FR-170–179)
- **Related Requirements:** FR-170
- **Related Acceptance:** `AC-EXT-4`
- **Related Risks:** Replay (§32)
- **Errors:** `EXTERNAL_COMMAND_REPLAY` (409)

### SEC-016 — Idempotency by external message ID

- **Area ID:** `SEC-EXTINTEG`
- **Threat Addressed:** Duplicate external delivery (#12)
- **Components Protected:** External Command Service
- **Implementation Location:** idempotency by integration/channel/message ID; duplicate returns original result, sets `idempotencyStatus=duplicate_replayed`; never creates a second queue item/vote/setting/mod action (§19.5 #3, §23.2.3)
- **Verification Method:** Unit: idempotency; Integration: duplicate command (§37.1 FR-171)
- **Related Requirements:** FR-171
- **Related Acceptance:** `AC-EXT-5`
- **Related Risks:** Duplicate delivery (§32)
- **Errors:** `EXTERNAL_COMMAND_DUPLICATE` (409)

### SEC-017 — Trusted external role mapping & staff allowlist

- **Area ID:** `SEC-EXTINTEG` / `MOD-EXTSTAFF`
- **Threat Addressed:** External role spoofing (#13)
- **Components Protected:** External Command Service, Moderation Service
- **Implementation Location:** per-integration staff user-ID allowlist and/or trusted role mappings; no client-side trust (§19.2, §19.5); staff-only failure reasons must not reveal allowlists/secrets/role claims (§23.5 #3)
- **Verification Method:** Integration: staff command flow (§37.1 FR-150–168)
- **Related Requirements:** FR-150, FR-151
- **Related Acceptance:** `AC-STAFF-1`
- **Related Risks:** Role spoofing (§32)
- **Errors:** `EXTERNAL_COMMAND_UNAUTHORIZED` (403), `EXTERNAL_ROLE_UNTRUSTED` (403)

### SEC-018 — Stable-identity vote integrity

- **Area ID:** `SEC-EXTINTEG` / `MOD-EXTVOTE`
- **Threat Addressed:** Vote manipulation via unstable/browser-provided identity (#14)
- **Components Protected:** External Command Service, Queue Engine (veto)
- **Implementation Location:** one vote per stable external user ID per candidate; no anonymous embed votes by default; external user IDs required for fair voting (§19.2, DL-015)
- **Verification Method:** Unit: veto threshold; Integration: veto cycle (§37.1 FR-130–143, FR-174)
- **Related Requirements:** FR-174, FR-136, FR-138–140
- **Related Acceptance:** `AC-VETO-3`
- **Related Risks:** Veto abuse; external identity instability (§32)
- **Errors:** `VOTE_NOT_ALLOWED` (403)

### SEC-019 — Public-token / secret separation

- **Area ID:** `SEC-EXTINTEG`
- **Threat Addressed:** Secret leakage via iframe URLs / browser JS (#15)
- **Components Protected:** Embeddable Room Client, External Command Service
- **Implementation Location:** public embed token distinct from server-side integration secret; no secrets in browser payloads (§19.5 #10); embed pages must not include secrets/host secrets/room passwords/session IDs/staff assertions in URL/JS/storage/postMessage/snapshot (§19.6.4)
- **Verification Method:** E2E: embed display; Security: no secret in client (§37.1 FR-179)
- **Related Requirements:** FR-179
- **Related Acceptance:** `AC-STAFF-7`
- **Related Risks:** Embed secret leakage (§32)
- **Errors:** —

### SEC-020 — Multi-level external rate limiting

- **Area ID:** `SEC-EXTINTEG` / rate limiting
- **Threat Addressed:** External command flooding (#9, #11)
- **Components Protected:** Rate Limit Service, External Command Service
- **Implementation Location:** per-integration, per-room, per-user, per-command rate limits (§19.5 #6, FR-172); observable + configurable (NFR-063); SR cooldown 90s / max pending 2 / max queue 50 (App. A); fails closed if Redis down
- **Verification Method:** Unit: rate limits; Load: command burst (§37.1 FR-172, NFR-060–069)
- **Related Requirements:** FR-172, NFR-063
- **Related Acceptance:** `AC-STAFF-6`
- **Related Risks:** Integration abuse (§32)
- **Errors:** `RATE_LIMITED` (429), `SONG_REQUEST_COOLDOWN` (429), `MAX_PENDING_PER_USER_REACHED` (409)

### SEC-021 — Strict schema validation of external payloads

- **Area ID:** `SEC-EXTINTEG`
- **Threat Addressed:** Malformed/injection via command payloads (#6, #11)
- **Components Protected:** External Command Service
- **Implementation Location:** strict (Zod) schema validation before command parsing (§19.5 #5)
- **Verification Method:** Unit: command parsing; Integration: invalid command (§37.1 FR-170–179)
- **Related Requirements:** FR-170, FR-175
- **Related Acceptance:** `AC-EXT-4`
- **Related Risks:** Forged commands (§32)
- **Errors:** `VALIDATION_FAILED` (400), `INVALID_COMMAND_SYNTAX` (400)

### SEC-022 — Signed outbound webhooks + embed origin allowlist + frame policy

- **Area ID:** `SEC-EXTINTEG` / `SEC-FRAME`
- **Threat Addressed:** Outbound spoofing; embed framing abuse (#15)
- **Components Protected:** Outbound Bot Webhook Service, embed pages
- **Implementation Location:** signed outbound webhooks (§19.5 #9, FR-176); embed origins restricted to configured allowlist (FR-178); frame policy: dynamic `frame-ancestors`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`, conservative COOP/CORP (§19.6.5); do **not** send `X-Frame-Options` on embed pages
- **Verification Method:** Integration: external command flow; Security: header audit (§37.1 FR-176/178)
- **Related Requirements:** FR-176, FR-178
- **Related Acceptance:** `AC-STAFF-6`, `AC-STAFF-7`
- **Related Risks:** Webhook spoofing; framing abuse (§32)
- **Errors:** —

### SEC-023 — Pseudonymous external-identity handling

- **Area ID:** `SEC-EXTINTEG` / `PRIV`
- **Threat Addressed:** Over-retention / PII exposure of external users
- **Components Protected:** External Command Service, data layer
- **Implementation Location:** external user IDs treated as pseudonymous identifiers; stored only as needed for voting/moderation/audit/rate-limiting (NFR-065, §21); external user ID hashed in logs (§24.2 #9)
- **Verification Method:** Integration: no sensitive data in public payloads (§37.1 NFR-040–043)
- **Related Requirements:** NFR-065, FR-117
- **Related Acceptance:** `AC-EXT-1`
- **Related Risks:** Privacy exposure (§21)
- **Errors:** —

### SEC-024 — Circuit breakers & graceful degradation (resilience / fail-closed control)

- **Area ID:** `ERR-CIRCUIT`
- **Threat Addressed:** Cascading failure and unsafe writes under dependency outage (availability + security: fail-closed for abuse-sensitive paths)
- **Components Protected:** all services depending on PostgreSQL, Redis, YouTube API, outbound webhooks
- **Implementation Location:** explicit breakers + timeouts + degraded modes (§23.6); Redis-down forces abuse-sensitive writes closed (§23.6.2 #2); PG-down stops durable writes, cache never authoritative (#3); webhook failures never roll back state (#4); breaker state visible in health/logs/metrics/alerts; manual override auditable (§23.6.1 #5)
- **Verification Method:** Integration: metadata failure, dependency unavailable (§37.1 NFR-021, NFR-023)
- **Related Requirements:** NFR-020, NFR-021, NFR-023
- **Related Acceptance:** `AC-P1-4`
- **Related Risks:** YouTube quota exhaustion; webhook failure; Redis/PG outage (§32)
- **Errors:** `DEPENDENCY_UNAVAILABLE` (503), `SERVICE_DEGRADED` (503), `YOUTUBE_METADATA_DEGRADED` (503), `WEBHOOK_DELIVERY_DEFERRED` (503)

---

## 3. Control → component coverage (reverse lookup)

| Component                    | Controls applied                                                                |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Identity / Nickname Service  | `SEC-001`, `SEC-002`, `SEC-004`, `SEC-005`, `SEC-006`                           |
| Auth Middleware              | `SEC-001`, `SEC-002`, `SEC-008`                                                 |
| Room Service                 | `SEC-002`, `SEC-003`                                                            |
| Queue Engine                 | `SEC-002`, `SEC-006`, `SEC-018`                                                 |
| Chat Service                 | `SEC-002`, `SEC-006`, `SEC-007`, `SEC-011`                                      |
| Moderation Service           | `SEC-002`, `SEC-010`, `SEC-011`, `SEC-017`                                      |
| Playback Coordinator         | `SEC-002`, `SEC-024`                                                            |
| Rate Limit Service           | `SEC-006`, `SEC-020`, `SEC-024`                                                 |
| External Command Service     | `SEC-014`–`SEC-018`, `SEC-020`, `SEC-021`, `SEC-023` (all under `SEC-EXTINTEG`) |
| Outbound Bot Webhook Service | `SEC-022`, `SEC-024`                                                            |
| YouTube Metadata Service     | `SEC-009`, `SEC-024`                                                            |
| Socket.IO Gateway            | `SEC-008`, `SEC-013`                                                            |
| Frontend Client              | `SEC-007`, `SEC-012`                                                            |
| Embeddable Room Client       | `SEC-012`, `SEC-013`, `SEC-019`, `SEC-022`                                      |

---

## 4. Control → acceptance-criteria coverage (audit checklist)

| Control                         | Verifying AC (see AC-MAP in requirements-graph)     |
| ------------------------------- | --------------------------------------------------- |
| `SEC-001`, `SEC-002`            | `AC-V140-2`, `AC-V140-5`, `AC-CHAT-3`, `AC-STAFF-1` |
| `SEC-003`, `SEC-008`            | `AC-RC-2`, `AC-V140-7`                              |
| `SEC-004`, `SEC-005`, `SEC-006` | `AC-JOIN-2`, `AC-JOIN-3`, `AC-JOIN-4`, `AC-CHAT-4`  |
| `SEC-007`, `SEC-011`            | `AC-CHAT-3`, `AC-CHAT-4`, `AC-CHAT-5`               |
| `SEC-012`, `SEC-013`            | `AC-P1-3`, `AC-EXT-3`, `AC-STAFF-7`                 |
| `SEC-014`–`SEC-016`, `SEC-021`  | `AC-EXT-4`, `AC-EXT-5`                              |
| `SEC-017`                       | `AC-STAFF-1`, `AC-STAFF-5`                          |
| `SEC-018`                       | `AC-VETO-3`                                         |
| `SEC-019`, `SEC-022`            | `AC-STAFF-6`, `AC-STAFF-7`                          |
| `SEC-020`                       | `AC-STAFF-6`                                        |
| `SEC-024`                       | `AC-P1-4`                                           |

---

## 5. Auditor entry point

For a security audit, load in this order: this file → `trackstacc-ai-reference.md` (Security Summary) → SDD §19.5 (authoritative external) → SDD §19 full → SDD §20.3 (external abuse controls) → SDD §23.6 (degradation). Cross-check each `SEC-NNN` against its **Verification Method** and confirm the corresponding test area exists per §37.1. Any control touching external integration must be validated against §19.5 as the source of truth, never against a downstream restatement.
