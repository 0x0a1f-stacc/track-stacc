# trackstacc-ai-index.md

**AI Navigation Index for the Trackstacc SDD (v1.4.0)**

This file is a sitemap for AI systems. Use it to turn a question into the precise set of sections/files to load. It does not restate the design; it points to it. Stable IDs (defined in `trackstacc-ai-documentation-plan.md`) are durable anchors that survive section renumbering. Source IDs (`FR-*`, `NFR-*`, `DL-*`, `LIM-*`, `TD-*`) are preserved verbatim.

**How to use:** read this index → identify relevant stable IDs → load the matching SDD sections/files. For most questions, also load `trackstacc-ai-reference.md` first.

---

## 0. System Overview

Trackstacc (`trackstacc.live`) is a **no-registration, real-time collaborative YouTube listening-room** web app. Anyone can open a native room to **listen and view the playlist for free**; to **chat, vote, add songs, react, or moderate** a user must hold a **password-protected nickname** (the `member` tier). Rooms can also be exposed via **read-only external embeds** driven by a **server-to-server external chat command bridge**; the native protection rule does not apply to embeds. The server is authoritative for all room state. Stack: Next.js 14 + Fastify 5 + Socket.IO + PostgreSQL + Redis + Prisma.

- Concept & constraint → `OVR` (§1)
- Two usage modes & differentiator → `PROD` (§3)
- Glossary → `DEF` (§4)
- Compressed full model → `trackstacc-ai-reference.md`

---

## 1. Domain Concepts

| Concept | Stable ID | One-sentence description | Cross-refs |
| ------- | --------- | ------------------------ | ---------- |
| Free listening (Listener) | `FEAT-LISTEN` | Any visitor can open a room and hear playback + view the playlist with no identity. | FR-019, FR-078, DL-020, `ROLE`, `DATA-SESSIONS` |
| Protected-nickname gate | `FEAT-NICKPROT` | A password-protected nickname is required for all native interactive actions. | FR-010/028, NFR-038, DL-019, `SEC-TIER` |
| Room | `DATA-ROOMS` | Shared real-time space with chat, playback, queue, settings. | `FEAT-ROOMCREATE`, `API-ROOMS` |
| Queue item & states | `DATA-QUEUE` | Track entry moving through suggested→queued→playing→played/skipped/removed/failed/rejected/vetoed. | `FEAT-QUEUE`, `ALGO` |
| Playlist mechanic | `FEAT-MECHANICS` | Rule set governing how songs enter/advance: FIFO, voting, DJ rotation, host-curated, suggestions. | `MECH`, `ALGO`, FR-050–060 |
| Pre-play veto | `FEAT-VETO` | Short pre-playback gate where eligible users keep (`!yay`) or veto (`!nay`) the next candidate. | FR-130–143, `DATA-VETOWIN`, DL-013/014 |
| External participant | `DATA-EXTPART` | Trackstacc identity mapping for an embedding-site user, used for voting/rate-limit/moderation/audit. | `FEAT-EXTCMD`, DL-012 |
| External mute | `MOD-EXTMUTE` | Staff restriction blocking an external user's `!sr`/`!yay`/`!nay`, timed or permanent, with early unmute. | FR-163–168, §10.16–10.18 |
| Song request policy | `FEAT-SRPOLICY` | Controls who may submit songs and how often (open/cooldown/after-play/staff-only/closed). | FR-157–162, §11.10 |
| Net nays | `MECH` | Veto score = `nayCount − yayCount`. | FR-138, §11.8 |
| External reference | `DATA-EXTREF` | Short room/integration/channel-scoped tag (e.g. `[K7Q]`) for targeting items in chat. | §11.9 |

---

## 2. User Roles

| Role | Stable ID | Description | Cross-refs |
| ---- | --------- | ----------- | ---------- |
| Visitor / Listener | `ROLE` | In-room user without a protected-nickname session; read-only (listen + view playlist; chat only if `listener_chat_visible`). | FR-019, FR-078, DL-020 |
| Protected Nickname User (`member`) | `ROLE` | Authenticated against a protected nickname; prerequisite for all native interactivity. | FR-010, `FEAT-NICKPROT` |
| Moderator | `ROLE` | Delegated moderation; must be a member. | FR-084, `MOD-NATIVE` |
| Host | `ROLE` | Room owner; must authenticate a protected nickname to exercise authority. | DL-002, `FEAT-ROOMCREATE` |
| System | `ROLE` | Server-generated events/actions. | `WS-S2C` |
| External Participant / Staff | `ROLE` | Embedding-site user / authorized staff via allowlist or trusted role mapping. | §9.2.2, `SEC-EXTINTEG` |
| Integration Bot | `ROLE` | System actor for signed outbound announcements only; no privileged writes. | §9.2.2 |

→ Full role list: `ROLE` §9.1.

---

## 3. Permission Model

| Item | Stable ID | Description | Cross-refs |
| ---- | --------- | ----------- | ---------- |
| Native permission matrix | `ROLE` (§9.2.1) | Every interactive capability requires `member`; Listener "No" actions return an upgrade prompt (FR-029). | FR-010/028/078, `SEC-TIER` |
| External permission matrix | `ROLE` (§9.2.2) | External capabilities depend on integration config, SR policy, moderation, rate limits; never on a native nickname; staff authority server-side only. | `SEC-EXTINTEG`, `MOD-EXTSTAFF` |
| Server-side tier enforcement | `SEC-TIER` | Tier encoded in signed token, re-derived on every REST request and WS event. | NFR-038, FR-028, §19.2 |

---

## 4. Core Workflows (`WF-*`, §10)

| Workflow | Stable ID | One-sentence description | Cross-refs |
| -------- | --------- | ------------------------ | ---------- |
| Create room | `WF-CREATE` | Choose mechanic/settings, server creates room + host secret, creator protects/authenticates a nickname to enter as host. | §10.1, `FEAT-ROOMCREATE` |
| Open room & join | `WF-JOIN` | Room loads in Listener mode; user upgrades in place to member by authenticating or claiming a protected nickname. | §10.2, `API-NICK` |
| Protect nickname | `WF-PROTECT` | Listener sets a password (with no-recovery warning) to gain participation. | §10.3, FR-020–029 |
| Add song | `WF-ADDSONG` | Member pastes YouTube URL; server validates rules and queues it. | §10.4, `FEAT-QUEUE` |
| Change mechanic | `WF-MECHCHANGE` | Host switches mechanic; current song uninterrupted, queue preserved, change announced + audited. | §10.5, FR-055–058 |
| Create integration | `WF-EXTSETUP` | Webmaster registers origin/channel/prefix/webhook/staff, receives embed URL + secret. | §10.6, `FEAT-EMBED` |
| External song request | `WF-EXTSR` | `!sr <url>` forwarded server-to-server, validated, queued, bot-announced. | §10.7, `SEC-EXTINTEG` |
| Veto announce | `WF-VETOANNOUNCE` | Server opens veto window for next candidate when an alternate exists. | §10.8, `FEAT-VETO` |
| External vote | `WF-EXTVOTE` | `!yay`/`!nay` recorded for eligible, non-muted users; counts broadcast. | §10.9, FR-134–138 |
| Veto outcome (vetoed) | `WF-VETO-VETOED` | Net nays hit threshold → mark vetoed, announce, advance. | §10.10, DL-014 |
| Veto outcome (passed) | `WF-VETO-PASSED` | Window closes without veto → play candidate. | §10.11 |
| Staff remove | `WF-STAFFRM` | `!rm <ref>` removes a queued item, audited + announced. | §10.12, `FEAT-EXTSTAFF` |
| Staff change SR policy | `WF-STAFFPOLICY` | `!music requests …` persists + broadcasts policy. | §10.13 |
| Staff force-skip | `WF-STAFFSKIP` | `!skip <reason>` skips current song, reason audited. | §10.14 |
| Now-playing | `WF-NOWPLAYING` | `!song`/`!np` returns current song + reference. | §10.15 |
| Staff mute / unmute / expiry | `WF-STAFFMUTE`/`WF-STAFFUNMUTE`/`WF-MUTEEXPIRE` | Mute blocks `!sr`/`!yay`/`!nay`; early unmute; lazy auto-expiry. | §10.16–10.18, FR-163–168 |

---

## 5. Data Domains (`DATA-*`, §14)

| Table / area | Stable ID | One-sentence description | Cross-refs |
| ------------ | --------- | ------------------------ | ---------- |
| `nickname_claims` | `DATA-NICKNAMES` | Global protected nicknames (hash + status). | DL-001, `API-NICK` |
| `rooms` | `DATA-ROOMS` | Room config incl. `listener_chat_visible`, `external_chat_music`. | `API-ROOMS`, FR-078 |
| `external_chat_music` JSONB | `DATA-EXTCONFIG` | Zod-validated external integration config blob. | TD-001, DL-018 |
| `room_sessions` | `DATA-SESSIONS` | Participants incl. Listeners; `access_tier`; in-place upgrade. | `SEC-TIER`, FR-028 |
| `tracks` | `DATA-TRACKS` | Cached YouTube metadata. | `YT`, `FEAT-QUEUE` |
| `queue_items` | `DATA-QUEUE` | Queue entries + states. | `ALGO`, `API-QUEUE` |
| `queue_votes` | `DATA-VOTES` | Voting-queue votes (upvote-only MVP). | DL-006 |
| `skip_votes` | `DATA-SKIPVOTES` | Live skip votes for current track. | FR-043 |
| `chat_messages` | `DATA-CHAT` | User/system/moderation/song messages. | `FEAT-CHAT`, DL-004 |
| `room_moderation_actions` | `DATA-MODACTIONS` | Native moderation audit. | `MOD-NATIVE`, FR-085 |
| `room_settings_history` | `DATA-SETTINGSHIST` | Settings-change audit. | FR-057, `WF-MECHCHANGE` |
| `site_integrations` | `DATA-INTEGRATIONS` | External integration config + secret hashes. | `SEC-EXTINTEG`, DL-018 |
| `external_participants` | `DATA-EXTPART` | External identity + mute fields. | DL-012, `MOD-EXTMUTE` |
| `external_commands` | `DATA-EXTCMD` | Command audit + idempotency. | FR-171, `SEC-EXTINTEG` |
| `external_references` | `DATA-EXTREF` | Short refs like `[K7Q]`. | §11.9 |
| `preplay_veto_votes` | `DATA-VETOVOTES` | One active vote per candidate per voter. | FR-136 |
| `preplay_veto_windows` | `DATA-VETOWIN` | Window status + threshold snapshot + result. | `FEAT-VETO` |
| Migration strategy | `DATA-MIGRATE` | Prisma Migrate, expand-contract zero-downtime, manual rollback. | §14.3, `DEVOPS` |

---

## 6. API Domains (`API-*`, §15)

| Group | Stable ID | One-sentence description | Cross-refs |
| ----- | --------- | ------------------------ | ---------- |
| Conventions | `API-CONV` | `/api/v1/` versioning, cursor pagination, rate-limit headers, request-id, naming. | NFR-035/036, `ERR` |
| Room | `API-ROOMS` | Create/get/patch room, host claim, password verify. | `DATA-ROOMS`, FR-001–006 |
| Nickname & session | `API-NICK` | `/listen` (listener), `/join` (member, protect-and-join, upgrade-in-place), protect/authenticate/change. | `FEAT-NICKPROT`, `SEC-TIER` |
| Queue | `API-QUEUE` | Add/remove queue items, vote. | `DATA-QUEUE`, FR-030–034 |
| Chat | `API-CHAT` | Paginated history, delete message. | `DATA-CHAT`, FR-075 |
| Moderation | `API-MOD` | Mute/unmute/ban/unban/assign/revoke moderator. | `MOD-NATIVE`, FR-080–085 |
| External integration | `API-INTEG` | Integration CRUD, `site-command` (server-to-server), embed/snapshot. | `SEC-EXTINTEG`, FR-110–119 |

Key error codes for gated actions: `NICKNAME_PROTECTION_REQUIRED` (409), `LISTENER_READ_ONLY` (403) → `ERR-REGISTRY` (§23.4).

---

## 7. WebSocket Domains (`WS-*`, §16)

| Family | Stable ID | One-sentence description | Cross-refs |
| ------ | --------- | ------------------------ | ---------- |
| Connection & reconnection | `WS-CONN` | Token-in-query connect; exponential backoff + jitter + phases; `room.snapshot` on reconnect. | §16.1.1, NFR-022 |
| Client→server | `WS-C2S` | Events with **minimum native tier**; Listeners limited to `playback.clientState`/`presence.heartbeat`. | `SEC-TIER`, NFR-038 |
| Server→client | `WS-S2C` | Snapshot, presence, chat, queue, playback, settings, integration, moderation, error. | §16.3 |
| Playback | `WS-PLAYBACK` | `playback.state`/`.resync`/`.clientState`/`.skipVote`. | `SYNC`, FR-040–046 |
| Chat | `WS-CHAT` | `chat.send`/`.message`/`.deleted`. | `FEAT-CHAT` |
| Queue & veto | `WS-QUEUE` | `queue.*` incl. `queue.item.veto_window.*`, `.vetoed`, `.veto_passed`. | `FEAT-VETO`, `FEAT-QUEUE` |
| Presence | `WS-PRESENCE` | `presence.heartbeat`/`.updated`. | FR-090–092 |
| Moderation | `WS-MOD` | `moderation.action`/`.applied`. | `MOD-NATIVE` |
| Integration | `WS-INTEG` | `integration.command.*`, `external.bot_message.created`, `room.external_settings.changed`. | `FEAT-EXTCMD` |

---

## 8. Security Domains (`SEC-*`, §19)

| Area | Stable ID | One-sentence description | Cross-refs |
| ---- | --------- | ------------------------ | ---------- |
| Threat model | `SEC-THREAT` | 16 risks incl. listener escalation, external forgery, secret leakage. | §19.1, `RISK` |
| Mitigations | `SEC-MITIG` | Risk→mitigation table. | §19.2 |
| Password storage | `SEC-PWD` | Argon2id; never store/log/return hashes. | NFR-030, FR-021 |
| Sessions/tokens | `SEC-SESSION` | httpOnly signed cookies + short-lived WS tokens encoding tier. | NFR-031/032 |
| **Native tier enforcement** | `SEC-TIER` | Listener gate enforced server-side on every request/event. | **NFR-038, FR-028** |
| **External integration security** | `SEC-EXTINTEG` | **AUTHORITATIVE (§19.5):** HMAC/bearer, freshness, idempotency, replay, schema, rate limits, sanitization, audit, signed webhooks, token≠secret, origin allowlist, frame-ancestors. | §12.4/13.11/20.3/31.7/31.9 reference it |
| CORS | `SEC-CORS` | Deny-by-default origin model + behavior. | NFR-037, FR-178 |
| CSP | `SEC-CSP` | Strict native CSP + per-integration embed CSP. | NFR-037 |
| Frame/header policy | `SEC-FRAME` | `frame-ancestors`, referrer, permissions, COOP/CORP. | §19.6.5 |

**Precedence:** `SEC-EXTINTEG` (§19.5) overrides any downstream reference copy.

---

## 9. Moderation Domains (`MOD-*`, §20)

| Area | Stable ID | One-sentence description | Cross-refs |
| ---- | --------- | ------------------------ | ---------- |
| Abuse scenarios | `MOD-ABUSE` | 14 native + external abuse scenarios. | §20.1, `RISK` |
| Native controls | `MOD-NATIVE` | Protected-nickname gate, rate limits, duration/duplicate, host tools, audit. | §20.2, FR-080–088 |
| Command bridge controls | `MOD-EXTBRIDGE` | Auth/freshness/idempotency/replay/rate-limit/sanitize/audit. | ref `SEC-EXTINTEG` |
| Queue abuse controls | `MOD-EXTQUEUE` | Size/pending/rate/duration/duplicate/blocklist/quarantine. | §20.3 |
| Vote abuse controls | `MOD-EXTVOTE` | One vote per stable external ID; no anonymous votes; eligibility. | DL-013/015 |
| Staff abuse controls | `MOD-EXTSTAFF` | Allowlists, role mapping, rate limits, audit; permanent mute needs explicit syntax. | DL-016 |
| Embed abuse controls | `MOD-EXTEMBED` | Origin allowlist, token≠secret, no browser secrets, no privileged embed mutations. | ref `SEC-CORS`/`SEC-CSP` |
| External mute lifecycle | `MOD-EXTMUTE` | Timed/permanent mute, early unmute, lazy auto-expiry. | FR-163–168, §10.16–18 |

---

## 10. Deployment & Operations Domains

| Area | Stable ID | One-sentence description | Cross-refs |
| ---- | --------- | ------------------------ | ---------- |
| MVP topology & scaling | `DEPLOY` | CDN + single app deployable (REST+WS+workers) + managed PG/Redis; stateless API; split WS later. | §25, TD-002 |
| CI/CD | `DEVOPS` (§39.1) | Pipeline stages + branch strategy; `pnpm audit` gate. | `TEST` |
| Configuration | `DEVOPS` (§39.2) | Env-var precedence; required vars fail-fast. | §39.2.2 |
| Environments | `DEVOPS` (§39.3) | Local/CI/staging/prod parity (PG16/Redis7/Node20+/pnpm 9.15.4). | §39.3.1 |
| Dependency management | `DEVOPS` (§39.4) | pnpm workspaces + Turborepo + Corepack; frozen lockfile; root Prisma schema; `next.config.mjs`. | TD-001 |
| Circuit breakers/readiness | `ERR-CIRCUIT` | Per-dependency breakers; readiness fails on PostgreSQL/Redis loss. | §23.6, NFR-023 |

---

## 11. Observability Domains (`OBS`, §24)

| Area | Stable ID | One-sentence description | Cross-refs |
| ---- | --------- | ------------------------ | ---------- |
| Metrics | `OBS` (§24.1) | 21 metrics incl. nickname-protection rate, external mute counts, veto outcomes. | NFR-068 |
| Logs | `OBS` (§24.2) | Structured logs with request/room/session-hash; never-log list. | `PRIV`, NFR-043 |
| Alerts | `OBS` (§24.3) | 12 alert conditions incl. brute-force, webhook failures, veto abuse. | `RISK` |

---

## 12. Privacy & Compliance Domains

| Area | Stable ID | One-sentence description | Cross-refs |
| ---- | --------- | ------------------------ | ---------- |
| Data collected / not collected | `PRIV` (§21.1–21.2) | Minimal identity; Listeners hold no nickname/hash; pseudonymous external IDs; no email/OAuth/payment. | NFR-040–043 |
| Retention | `PRIV` (§21.3) | Default retention windows by data type. | DL-003 |
| YouTube compliance | `YT` (§22.4) | Embed-only; no download/cache/re-stream; attribution + quota monitoring. | NFR-050–053 |

---

## 13. Decision Log References (`DEC`, §28 — `DL-001…DL-020`)

| Decision | Stable ID | Decision summary | Primarily affects |
| -------- | --------- | ---------------- | ----------------- |
| DL-001 | `DEC` | Global nicknames. | `DATA-NICKNAMES`, `FEAT-NICKPROT` |
| DL-002 | `DEC` | Host: link MVP, nickname-bind Phase 2. | `FEAT-ROOMCREATE`, `SEC-SESSION` |
| DL-003 | `DEC` | 14-day inactivity expiry. | `DATA-ROOMS`, `PRIV` |
| DL-004 | `DEC` | 100-message join history. | `DATA-CHAT`, `API-CHAT` |
| DL-005 | `DEC` | Public directory Phase 2. | `SCOPE`, LIM-002 |
| DL-006 | `DEC` | Upvote-only MVP. | `MECH`, `DATA-VOTES` |
| DL-007 | `DEC` | No default suggestions in host-curated. | `MECH` |
| DL-008 | `DEC` | Reserved-name + confusable blocking. | `COMP` §13.3 |
| DL-009 | `DEC` | 10-char minimum password. | `FEAT-NICKPROT`, `APPX-DEFAULTS` |
| DL-010 | `DEC` | 3s playback sync tolerance. | `SYNC`, LIM-004 |
| DL-011 | `DEC` | External integration = MVP should-have. | `SCOPE`, `MILE` M7 |
| DL-012 | `DEC` | External records per-integration-per-room. | `DATA-EXTPART` |
| DL-013 | `DEC` | Requester veto votes allowed. | `FEAT-VETO`, `MOD-EXTVOTE` |
| DL-014 | `DEC` | Play last candidate on veto exhaustion. | `MECH` §11.7, `ALGO` §17.6 |
| DL-015 | `DEC` | Optional trust signals in payload. | `API-INTEG`, `MOD-EXTVOTE` |
| DL-016 | `DEC` | Phase-2 staff confirmation for destructive actions. | `MOD-EXTSTAFF` |
| DL-017 | `DEC` | 3 webhook retries + DLQ. | `COMP` §13.12, TD-003 |
| DL-018 | `DEC` | Unique command prefix per room/channel. | `DATA-INTEGRATIONS` |
| DL-019 | `DEC` | **Mandatory native protection; free listening.** | `FEAT-NICKPROT`, `ROLE`, `UX`, `DATA-SESSIONS`, `SEC-TIER` |
| DL-020 | `DEC` | **Listener chat hidden by default.** | `FEAT-LISTEN`, FR-078, `DATA-ROOMS` |

---

## 14. Known Limitations & Technical Debt (`DEBT`, §38)

| ID | Stable ID | Summary | Target |
| -- | --------- | ------- | ------ |
| LIM-001 | `DEBT` | No password recovery (now blocks participation). | Phase 2 |
| LIM-002 | `DEBT` | No public room directory. | Phase 2 |
| LIM-003 | `DEBT` | No nickname profanity filter. | Phase 2 |
| LIM-004 | `DEBT` | Approximate playback sync (1–3s). | Accepted |
| LIM-005 | `DEBT` | No mobile-native apps. | Post-MVP |
| LIM-006 | `DEBT` | Read-only embed by default. | Phase 2 |
| LIM-007 | `DEBT` | Mandatory protection adds onboarding friction. | Accepted |
| TD-001 | `DEBT` | `external_chat_music` JSONB blob. | Phase 2 |
| TD-002 | `DEBT` | Single-process API + WS gateway. | Post-MVP |
| TD-003 | `DEBT` | No webhook dead-letter inspection UI. | Phase 2 |
| TD-004 | `DEBT` | No background metadata refresh. | Phase 2 |
| TD-005 | `DEBT` | No automated backup restore test. | Milestone 6 |
| TD-006 | `DEBT` | Frontend coverage lighter than backend. | Ongoing |

---

## 15. Quick Routing Cheatsheet

| If the question is about… | Load these stable IDs |
| -------------------------- | --------------------- |
| Who can do what | `ROLE`, `SEC-TIER`, FR-010/028/078 |
| Listening vs participating | `FEAT-LISTEN`, `FEAT-NICKPROT`, DL-019/020 |
| Adding/ordering songs | `FEAT-QUEUE`, `MECH`, `ALGO`, `DATA-QUEUE` |
| Voting / vetoing | `FEAT-VETO`, `DATA-VETOWIN/VETOVOTES`, `WS-QUEUE` |
| Realtime events | `WS-*`, `SEC-TIER` |
| External embeds/commands | `FEAT-EMBED`, `FEAT-EXTCMD`, `SEC-EXTINTEG`, `API-INTEG` |
| Staff/mute moderation | `MOD-*`, `MOD-EXTMUTE`, `SEC-EXTINTEG` |
| Errors / resilience | `ERR-REGISTRY`, `ERR-CIRCUIT` |
| Schema / migrations | `DATA-*`, `DATA-MIGRATE`, `DEVOPS` |
| Security review | `SEC-*` (esp. `SEC-EXTINTEG`, `SEC-TIER`), `MOD-*`, `PRIV` |
| Tests | `AC`, `TRACE`, `TEST` |
| Build sequence / estimates | `MILE`, `SCOPE` |
| Why a design choice exists | `DEC` (cite `DL-*`) |

---

*Companion files: `trackstacc-ai-reference.md` (compressed full reference), `trackstacc-ai-documentation-plan.md` (stable-ID scheme, section summaries, cross-reference maps, file-split plan, retrieval strategy).*
