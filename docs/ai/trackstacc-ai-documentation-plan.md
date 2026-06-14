# Trackstacc SDD — AI-Optimized Documentation Plan

**Source document:** `sdd.md` — *Software Design Document: Collaborative YouTube Playlist Rooms* (trackstacc.live), v1.4.0
**Source size:** ~34,700 words / 4,242 lines / 40 numbered sections
**This document:** the transformation plan. It defines stable IDs, per-section AI summaries, cross-reference maps, a file-split plan, and a retrieval strategy. It is a companion to two generated artifacts:
- `trackstacc-ai-index.md` — the AI navigation sitemap.
- `trackstacc-ai-reference.md` — the compressed full-system reference.

**Transformation contract:** No requirement, decision, constraint, behavior, acceptance criterion, or technical specification has been removed, weakened, reinterpreted, or changed. Everything here is restructuring, indexing, summarization, cross-referencing, and navigation only. Original IDs (`FR-*`, `NFR-*`, `DL-*`, `LIM-*`, `TD-*`) are preserved verbatim; new IDs are additive.

---

## 1. Executive Assessment

### 1.1 What this document is

Trackstacc is a no-registration, real-time collaborative YouTube listening-room web app. The SDD is mature and unusually complete for a draft: it already carries a change log, table of contents, formal decision log (20 resolved decisions), error-code registry, requirements traceability matrix, known-limitations/technical-debt register, and a periodic review schedule. It has absorbed three audit-remediation passes (Priority 1–3) plus a substantial v1.4.0 feature change (mandatory native nickname protection). It is internally consistent and cross-referenced, with Section 19.5 explicitly designated the single authoritative source for external-integration security.

### 1.2 Why it needs AI-optimization

The document's strength — exhaustive, audit-driven detail — is also its retrieval problem for LLM-assisted work:

1. **Length and density.** At ~34.7k words, the full document rarely fits comfortably alongside a real task plus generated code in a single context window, so agents either truncate (losing the cross-references that make the spec correct) or over-retrieve (wasting budget).
2. **Concept dispersion.** Single behaviors are spelled out in many places. The Listener/member tier model alone appears in §1, §2, §3.2.1, §4, §7.2–7.3, §8.4 (NFR-038), §9.2.1, §10.2–10.3, §13.1/13.3/13.6, §14.2 (`room_sessions`), §15.2, §16.2, §19.2, §23.4, §28 (DL-019/020), §30 M1/M5, §31.0.2, and §38 (LIM-007). An agent answering "how does the listener gate work?" needs a precomputed map, not a search.
3. **Authoritative-vs-reference ambiguity.** Several topics (notably external-integration security) are stated once authoritatively and referenced elsewhere. An agent that lands on a reference copy instead of §19.5 can miss precedence. This must be encoded explicitly.
4. **No stable anchors.** Sections are numbered, but numbers drift as the document evolves (the change log shows frequent renumbering risk). Behaviors lack durable identifiers an agent can cite without re-reading.
5. **Implementation reality is interleaved.** "Implementation note" callouts (e.g. `apps/api/src/lib/tokens.ts`, `error-codes.ts`, `genReqId`) pin design to code. These are high-value for code-gen/bug-fixing but easy to lose in prose.

### 1.3 Highest-leverage interventions (in priority order)

1. **Stable reference IDs** (Section 2 below) — durable anchors that survive renumbering and let agents cite "the rule at `SEC-TIER`" instead of "Section 9.2.1, also 19.2, also 23.4…".
2. **AI reference document** (`trackstacc-ai-reference.md`) — a ~3.5k-word always-load layer that lets most questions be answered, and most retrievals be scoped, without loading the full SDD.
3. **AI navigation index** (`trackstacc-ai-index.md`) — a sitemap that turns a question into a precise set of sections/files to load.
4. **Cross-reference maps** (Section 4 below) — the relationship tables (Architecture↔Components, Data↔API, APIs↔WS, AC↔Requirements, Risks↔Mitigations, Decisions↔Sections) that the prose implies but never tabulates in one place.
5. **File split plan** (Section 5 below) — so retrieval can be file-scoped, not section-scoped.

### 1.4 Notable consistency observations (for human follow-up, not changes)

These are surfaced for the document owner; this transformation does **not** alter the source. They are catalogued in Section 6.5 as proposed improvements.

- **NFR target drift between body and traceability matrix.** §8.1 states NFR-001 chat "p95 under 500ms" and NFR-003 join "p95 under 1.5s"; Appendix D (§37.2) lists "NFR-001 REST p95 < 200ms," "NFR-002 WebSocket p95 < 100ms," and "NFR-004 LCP < 2s" against an NFR-005 body target of "LCP under 2.5s." The matrix and body use different numbers and partly different NFR-to-metric mappings.
- **`embedMode` enum mismatch.** §14.2 `external_chat_music` schema allows `"readonly" | "interactive"`, while §13.10 enumerates embed modes `player_and_queue_readonly | queue_readonly | compact | full_readonly`. The JSONB `songRequestPolicy.mode` enum (`open|cooldown|allowlist|closed`) also differs from the product-facing §11.10 modes (`open|per_user_cooldown|after_user_song_finishes|staff_only|closed`).
- **`NICKNAME_REQUIRED` vs `NICKNAME_PROTECTION_REQUIRED`.** Both exist in the §23.4 registry; with v1.4.0 making protection mandatory, the distinction and intended usage of the older `NICKNAME_REQUIRED` (409) should be confirmed.

None of the above blocks the AI-doc work; all are recorded as open follow-ups so an agent doesn't silently "fix" them.

---

## 2. Stable Identifier Scheme

### 2.1 Design rules

1. **Format:** `DOMAIN` or `DOMAIN-AREA` in `UPPER_SNAKE`/`UPPER-KEBAB`. Item-level IDs from the source (`FR-001`, `NFR-038`, `DL-019`, `LIM-007`, `TD-001`) are preserved unchanged and are the canonical leaf IDs.
2. **Additive only:** new IDs never replace source IDs; they sit above them as navigational anchors.
3. **Stable:** an ID maps to a *concept*, not a section number. If the SDD renumbers, the ID's "current location" column updates; the ID does not.
4. **One concept, one home.** Where the SDD names an authoritative source, the ID points there and references are marked `(ref → ID)`.

### 2.2 Top-level domain IDs (map to SDD sections)

| Stable ID | Name | SDD § | One-line scope |
| --------- | ---- | ----- | -------------- |
| `DOC-META` | Document metadata, change log, review | front matter, §40 | Versioning, change log, review cadence/history. |
| `OVR` | Executive summary | §1 | Product concept, no-registration constraint, host model. |
| `GOAL` | Goals and non-goals | §2 | 18 goals, 15 MVP non-goals. |
| `PROD` | Product overview | §3 | Two usage modes (native, embed), core differentiator. |
| `DEF` | Definitions | §4 | Canonical glossary of ~35 terms. |
| `ASM` | Assumptions | §5 | 15 operating assumptions. |
| `STK` | Stakeholders | §6 | Stakeholder interests. |
| `FR` | Functional requirements | §7 | FR-001…FR-179 across 14 groups. |
| `NFR` | Non-functional requirements | §8 | NFR-001…NFR-069 across 7 groups. |
| `ROLE` | Roles and permissions | §9 | Roles + native & external permission matrices. |
| `UX` | UX flows | §10 | 18 step-by-step flows. |
| `MECH` | Playlist mechanics design | §11 | 5 mechanics + veto + thresholds + SR policy. |
| `ARCH` | System architecture | §12 | Layers, stack, server authority, diagrams. |
| `COMP` | Component design | §13 | 12 components and their responsibilities. |
| `DATA` | Data model | §14 | 17 tables + JSONB schema + migrations. |
| `API` | API design | §15 | Conventions + REST endpoints by group. |
| `WS` | WebSocket event design | §16 | Connection, reconnection, event families. |
| `ALGO` | Queue selection algorithms | §17 | Per-mechanic selection + veto advance cycle. |
| `SYNC` | Playback synchronization | §18 | Server time model, resync, autoplay. |
| `SEC` | Security design | §19 | Threats, mitigations, secrets, CORS/CSP. |
| `MOD` | Abuse prevention & moderation | §20 | Scenarios + native & external controls. |
| `PRIV` | Privacy design | §21 | Data collected/not collected, retention. |
| `YT` | YouTube integration | §22 | Playback, metadata, search, compliance. |
| `ERR` | Error handling & resilience | §23 | Envelopes, error registry, circuit breakers. |
| `OBS` | Observability | §24 | Metrics, logs, alerts. |
| `DEPLOY` | Deployment architecture | §25 | MVP topology, scaling strategy. |
| `TEST` | Testing strategy | §26 | Unit, integration, WS, E2E, load. |
| `SCOPE` | MVP scope | §27 | Must/should/post-MVP. |
| `DEC` | Decision log | §28 | DL-001…DL-020. |
| `RECDEC` | Recommended product decisions | §29 | 15 product recommendations. |
| `MILE` | Implementation milestones | §30 | M1–M7 + effort conventions. |
| `AC` | Acceptance criteria | §31 | Audit + feature + per-area criteria. |
| `RISK` | Risks and mitigations | §32 | Risk → impact → mitigation table. |
| `APPX-DEFAULTS` | Recommended default settings | §33 (App. A) | Default values table. |
| `APPX-MSGS` | Example system messages | §34 (App. B) | System/bot message catalog. |
| `APPX-SNAPSHOT` | Example room state snapshot | §35 (App. C) | Canonical room-state JSON. |
| `FINAL` | Final recommendation | §36 | Build recommendation. |
| `TRACE` | Requirements traceability | §37 (App. D) | FR/NFR → component/API/table/test. |
| `DEBT` | Known limitations & tech debt | §38 | LIM-001…007, TD-001…006. |
| `DEVOPS` | Development operations | §39 | CI/CD, config, environments, deps. |

### 2.3 Feature IDs (`FEAT-*`)

| Stable ID | Feature | Primary § | Key source IDs |
| --------- | ------- | --------- | -------------- |
| `FEAT-LISTEN` | Free read-only listening (Listener tier) | §3.2.1, §9.2.1 | FR-019, FR-078, DL-020 |
| `FEAT-NICKPROT` | Protected-nickname participation gate | §7.2–7.3, §9.2.1 | FR-010, FR-014, FR-020–028, NFR-038, DL-019 |
| `FEAT-ROOMCREATE` | Room creation & host setup | §7.1, §10.1 | FR-001–006 |
| `FEAT-QUEUE` | Collaborative queue | §7.4, §13.4 | FR-030–037 |
| `FEAT-PLAYBACK` | Synchronized playback | §7.5, §13.5, §18 | FR-040–046 |
| `FEAT-CHAT` | Real-time chat | §7.7, §13.6 | FR-070–078 |
| `FEAT-MECHANICS` | Playlist mechanics & safe changes | §7.6, §11 | FR-050–060 |
| `FEAT-MOD` | Native moderation | §7.8, §13.7, §20 | FR-080–088 |
| `FEAT-PRESENCE` | Presence | §7.9 | FR-090–092 |
| `FEAT-ROOMSETTINGS` | Room settings | §7.10 | FR-100–106 |
| `FEAT-EMBED` | Read-only external embeds | §7.11, §13.10 | FR-110–119 |
| `FEAT-EXTCMD` | External chat command bridge | §3.2.2, §13.11 | FR-115–119, FR-170–179 |
| `FEAT-VETO` | Pre-play veto | §7.12, §11.7–11.8 | FR-130–143 |
| `FEAT-SRPOLICY` | Song request policy | §7.13, §11.10 | FR-157–162 |
| `FEAT-EXTSTAFF` | External staff commands | §7.13, §13.11 | FR-150–156, FR-162 |
| `FEAT-EXTMUTE` | External participant muting | §7.13, §10.16–10.18 | FR-163–168 |

### 2.4 Workflow IDs (`WF-*`, map to §10)

| Stable ID | Workflow | §10 sub |
| --------- | -------- | ------- |
| `WF-CREATE` | Create room | 10.1 |
| `WF-JOIN` | Open room & join (listen → member) | 10.2 |
| `WF-PROTECT` | Protect nickname | 10.3 |
| `WF-ADDSONG` | Add song | 10.4 |
| `WF-MECHCHANGE` | Change playlist mechanic | 10.5 |
| `WF-EXTSETUP` | Webmaster creates integration | 10.6 |
| `WF-EXTSR` | External `!sr` request | 10.7 |
| `WF-VETOANNOUNCE` | Announce veto candidate | 10.8 |
| `WF-EXTVOTE` | External `!yay`/`!nay` | 10.9 |
| `WF-VETO-VETOED` | Candidate vetoed → advance | 10.10 |
| `WF-VETO-PASSED` | Candidate passes → play | 10.11 |
| `WF-STAFFRM` | Staff remove by reference | 10.12 |
| `WF-STAFFPOLICY` | Staff change SR policy | 10.13 |
| `WF-STAFFSKIP` | Staff force-skip | 10.14 |
| `WF-NOWPLAYING` | Ask current song | 10.15 |
| `WF-STAFFMUTE` | Staff mute external participant | 10.16 |
| `WF-STAFFUNMUTE` | Staff early unmute | 10.17 |
| `WF-MUTEEXPIRE` | Mute auto-expiry | 10.18 |

### 2.5 Data-area IDs (`DATA-*`, map to §14.2 tables)

| Stable ID | Table | Notes anchor |
| --------- | ----- | ------------ |
| `DATA-NICKNAMES` | `nickname_claims` | Global protected nicknames. |
| `DATA-ROOMS` | `rooms` | Room config; holds `listener_chat_visible`, `external_chat_music`. |
| `DATA-EXTCONFIG` | `external_chat_music` (JSONB on `rooms`) | Documented Zod schema; TD-001. |
| `DATA-SESSIONS` | `room_sessions` | `access_tier` listener/member; in-place upgrade. |
| `DATA-TRACKS` | `tracks` | Cached YouTube metadata. |
| `DATA-QUEUE` | `queue_items` | Queue + states. |
| `DATA-VOTES` | `queue_votes` | Voting-queue votes. |
| `DATA-SKIPVOTES` | `skip_votes` | Live skip votes. |
| `DATA-CHAT` | `chat_messages` | User/system/moderation/song. |
| `DATA-MODACTIONS` | `room_moderation_actions` | Native moderation audit. |
| `DATA-SETTINGSHIST` | `room_settings_history` | Settings change audit. |
| `DATA-INTEGRATIONS` | `site_integrations` | External integration config + secret hashes. |
| `DATA-EXTPART` | `external_participants` | External identity + mute fields. |
| `DATA-EXTCMD` | `external_commands` | Command audit + idempotency. |
| `DATA-EXTREF` | `external_references` | Short refs like `[K7Q]`. |
| `DATA-VETOVOTES` | `preplay_veto_votes` | One active vote/candidate/voter. |
| `DATA-VETOWIN` | `preplay_veto_windows` | Window status + threshold snapshot. |
| `DATA-MIGRATE` | Migration strategy (§14.3) | Prisma Migrate, expand-contract. |

### 2.6 API-group IDs (`API-*`)

| Stable ID | Group | §15 anchor |
| --------- | ----- | ---------- |
| `API-CONV` | Conventions (versioning, pagination, rate-limit headers, request-id, naming) | §15.1 |
| `API-ROOMS` | Room endpoints | §15.2 Room |
| `API-NICK` | Nickname & session endpoints (`/listen`, `/join`, protect/authenticate) | §15.2 Nickname/Session |
| `API-QUEUE` | Queue endpoints | §15.2 Queue |
| `API-CHAT` | Chat endpoints (history, delete) | §15.2 Chat |
| `API-MOD` | Moderation endpoints | §15.2 Moderation |
| `API-INTEG` | External integration + embed + site-command endpoints | §15.2 External |

### 2.7 WebSocket-family IDs (`WS-*`)

| Stable ID | Family | §16 anchor |
| --------- | ------ | ---------- |
| `WS-CONN` | Connection, token validation, reconnection backoff | §16.1, §16.1.1 |
| `WS-C2S` | Client→server events + minimum tier | §16.2 |
| `WS-S2C` | Server→client events | §16.3 |
| `WS-PLAYBACK` | `playback.state`, `playback.resync`, `playback.clientState`, `playback.skipVote` | §16.2/16.3 |
| `WS-CHAT` | `chat.send`, `chat.message`, `chat.deleted` | §16.2/16.3 |
| `WS-QUEUE` | `queue.*` incl. `queue.item.veto_window.*`, `queue.item.vetoed/veto_passed` | §16.3 |
| `WS-PRESENCE` | `presence.heartbeat`, `presence.updated` | §16.2/16.3 |
| `WS-MOD` | `moderation.action`, `moderation.applied` | §16.2/16.3 |
| `WS-INTEG` | `integration.command.*`, `external.bot_message.created`, `room.external_settings.changed` | §16.3 |

### 2.8 Security-area IDs (`SEC-*`) and moderation-area IDs (`MOD-*`)

| Stable ID | Area | Anchor | Authority note |
| --------- | ---- | ------ | -------------- |
| `SEC-THREAT` | Threat model (16 risks) | §19.1 | — |
| `SEC-MITIG` | Risk→mitigation table | §19.2 | — |
| `SEC-PWD` | Password storage (Argon2id) | §19.3 | — |
| `SEC-SESSION` | Session/WS tokens; tier in token | §19.4 | — |
| `SEC-TIER` | Native tier enforcement (listener gate) | §9.2.1, §19.2, NFR-038, FR-028 | Server-side, every request/event. |
| `SEC-EXTINTEG` | External integration security | §19.5 | **AUTHORITATIVE** — §12.4, §13.11, §20.3, §31.7, §31.9 reference it. |
| `SEC-CORS` | CORS origin model & behavior | §19.6.1–19.6.2 | — |
| `SEC-CSP` | Native + embed CSP | §19.6.3–19.6.4 | — |
| `SEC-FRAME` | Frame/header policy | §19.6.5 | — |
| `MOD-NATIVE` | Native moderation tools | §13.7, §20.2 | — |
| `MOD-ABUSE` | Abuse scenarios + native controls | §20.1–20.2 | — |
| `MOD-EXTBRIDGE` | Command-bridge controls | §20.3 Command Bridge | ref → `SEC-EXTINTEG` |
| `MOD-EXTQUEUE` | Queue abuse controls | §20.3 Queue | — |
| `MOD-EXTVOTE` | Vote abuse controls | §20.3 Vote | — |
| `MOD-EXTSTAFF` | Staff abuse controls | §20.3 Staff | — |
| `MOD-EXTEMBED` | Embed abuse controls | §20.3 Embed | ref → `SEC-CORS`/`SEC-CSP` |
| `MOD-EXTMUTE` | External mute lifecycle | §10.16–10.18, §13.11 | — |
| `ERR-REGISTRY` | Formal error code registry | §23.4 | Canonical code list. |
| `ERR-CIRCUIT` | Circuit breakers & degradation | §23.6 | YouTube/Redis/PG/webhook. |

---

## 3. Section AI Summaries

Each summary uses the required template. *Dependencies* = sections this relies on; *Used By* = sections that rely on it. "Open Questions" appears only where the source leaves something unresolved or internally inconsistent. No content is invented.

### `OVR` — §1 Executive Summary
- **Purpose:** State the product concept and the defining no-registration constraint.
- **Key Concepts:** Real-time music rooms; free listening; protected-nickname participation gate; host model; external embeds preserve server authority.
- **Dependencies:** none (entry point).
- **Used By:** every downstream section; `trackstacc-ai-reference.md`.
- **Critical Decisions:** No traditional registration; listen free, participate with a protected nickname (DL-019).
- **Implementation Impact:** Frames the two-tier native model that threads through identity, data, API, WS, and security.
- **Risk Areas:** Conversion friction (RISK; LIM-007).

### `GOAL` — §2 Goals and Non-Goals
- **Purpose:** Enumerate 18 goals and 15 MVP non-goals.
- **Key Concepts:** Instant rooms; free listen; protected-nickname participation; collaborative YouTube playback; external embeds; server authority; no native audio hosting; embeds don't trust browser identity.
- **Dependencies:** `OVR`.
- **Used By:** `SCOPE`, `AC`, `TRACE`.
- **Critical Decisions:** Non-goals fix MVP boundaries (no accounts, no monetization, no native apps, no scraping).
- **Implementation Impact:** Scope guardrails for every feature.
- **Risk Areas:** Scope creep if non-goals are ignored.

### `PROD` — §3 Product Overview
- **Purpose:** Describe the two usage modes and the differentiator.
- **Key Concepts:** Native experience (listen free → protect nickname → participate); embedded experience (read-only iframe + server-to-server command bridge); "listening without onboarding, identity without registration."
- **Dependencies:** `OVR`, `GOAL`.
- **Used By:** `ROLE`, `UX`, `ARCH`, `SEC-EXTINTEG`.
- **Critical Decisions:** Native protection requirement explicitly scoped to native site only (DL-019).
- **Implementation Impact:** Establishes Listener vs member tiers and the embed authority boundary.
- **Risk Areas:** Confusing native gating with embed model.

### `DEF` — §4 Definitions
- **Purpose:** Canonical glossary (~35 terms).
- **Key Concepts:** Visitor, Listener, Participant, Native Access Tier (`listener`/`member`), Protected/Unprotected nickname, Host, Moderator, External Participant/User ID, Pre-Play Veto, Net Nays, External Mute, Mute Duration.
- **Dependencies:** `PROD`.
- **Used By:** all sections (terminology source of truth).
- **Critical Decisions:** Tier vocabulary (`listener`/`member`) is normative.
- **Implementation Impact:** Naming consistency across code, data, API, WS.
- **Risk Areas:** Term drift if not referenced.

### `ASM` — §5 Assumptions
- **Purpose:** Record 15 operating assumptions.
- **Key Concepts:** YouTube embed-only (no download/proxy); approximate sync (1–3s); minimal identity data; no password recovery in MVP; external sites own identity; tier gate enforced server-side; native rule excludes embeds.
- **Dependencies:** `OVR`, `PROD`.
- **Used By:** `SYNC`, `YT`, `PRIV`, `SEC`, `DEBT` (LIM-001/004).
- **Critical Decisions:** No-recovery accepted for MVP; sync tolerance accepted.
- **Implementation Impact:** Bounds what's testable/guaranteeable.
- **Risk Areas:** No-recovery now blocks participation, not just a nickname (LIM-001, LIM-007).

### `STK` — §6 Stakeholders
- **Purpose:** Stakeholder interests.
- **Key Concepts:** Casual users, hosts, moderators, engineering, product/design, legal/compliance, operations.
- **Dependencies:** none.
- **Used By:** `RECDEC`, `RISK`.
- **Critical Decisions:** none.
- **Implementation Impact:** Prioritization context.
- **Risk Areas:** none.

### `FR` — §7 Functional Requirements
- **Purpose:** Authoritative functional requirements FR-001…FR-179 in 14 groups.
- **Key Concepts:** Room creation; join/listen/nickname (FR-010, FR-019); nickname protection (FR-020–029); YouTube input; playback; mechanics; chat (FR-071/078); moderation; presence; room settings; external embeds/commands; pre-play veto; staff commands & SR policy; external abuse prevention.
- **Dependencies:** `DEF`, `PROD`.
- **Used By:** `ROLE`, `UX`, `COMP`, `API`, `WS`, `AC`, `TRACE`.
- **Critical Decisions:** FR-010/FR-019/FR-028 codify the participation gate; FR-078 the listener chat default.
- **Implementation Impact:** The build checklist; each FR maps via `TRACE`.
- **Risk Areas:** Priority labels (MVP vs Phase 2) must be honored.

### `NFR` — §8 Non-Functional Requirements
- **Purpose:** NFR-001…NFR-069 across performance, scalability, availability, security, privacy, compliance, external integration.
- **Key Concepts:** Latency/scale targets; circuit breakers (NFR-023); Argon2id (NFR-030); server-side tier enforcement (NFR-038); error registry (NFR-036); CORS/CSP (NFR-037); external integration NFRs (NFR-060–069).
- **Dependencies:** `FR`.
- **Used By:** `ARCH`, `SEC`, `ERR`, `OBS`, `DEPLOY`, `TEST`, `TRACE`.
- **Critical Decisions:** NFR-038 makes the tier gate a hard server-side requirement.
- **Implementation Impact:** Defines acceptance thresholds for non-functional behavior.
- **Open Questions:** Body latency targets (§8.1) differ from Appendix D (§37.2) numbers — see §1.4 and §6.5.

### `ROLE` — §9 User Roles and Permissions
- **Purpose:** Roles + native permission matrix (§9.2.1) and external permission matrix (§9.2.2).
- **Key Concepts:** Listener (read-only), Protected Nickname User (= `member`), Moderator, Host, System, External Participant/Staff, Integration Bot; every native interactive capability requires `member`; host must authenticate to exercise authority.
- **Dependencies:** `DEF`, `FR` (FR-010/019/028/078).
- **Used By:** `UX`, `COMP` (Identity/Chat), `API`, `WS` (tier column), `SEC-TIER`, `AC`.
- **Critical Decisions:** Listener "No" actions return an upgrade prompt, not a generic denial (FR-029); external staff authority never from browser state.
- **Implementation Impact:** Drives authorization middleware for REST and WS.
- **Risk Areas:** Privilege escalation if tier not re-derived server-side (`SEC-TIER`).

### `UX` — §10 UX Flows
- **Purpose:** 18 step-by-step flows (`WF-*`).
- **Key Concepts:** Create (host protect-and-join), open/join (listener→member upgrade-in-place), protect nickname, add song, mechanic change, external setup, `!sr`, veto announce/vote/result, staff remove/policy/skip/now-playing/mute/unmute/auto-expiry.
- **Dependencies:** `ROLE`, `FR`, `MECH`.
- **Used By:** `COMP`, `API`, `WS`, `AC`, `TEST` (E2E).
- **Critical Decisions:** In-place session upgrade preserves playback continuity (§10.2, §31.0.2).
- **Implementation Impact:** Defines client/server step ordering and broadcast points.
- **Risk Areas:** Inconsistent gating if flows diverge from `ROLE`.

### `MECH` — §11 Playlist Mechanics Design
- **Purpose:** Define 5 mechanics, mechanic-change behavior, pre-play veto gate, threshold model, external references, SR policy.
- **Key Concepts:** FIFO, voting, DJ rotation, host-curated, suggestions; safe mechanic changes (no interrupt, preserve order, announce, audit); veto vs live skip distinction; `vetoThreshold` fixed/percentage/hybrid; `netNays`; SR policy modes.
- **Dependencies:** `FR` (FR-050–060, 130–143, 157–162), `DEF`.
- **Used By:** `ALGO`, `COMP` (Queue Engine), `WS` (veto events), `DATA` (veto tables), `AC`.
- **Critical Decisions:** Hybrid veto default; requester votes allowed (DL-013); play last candidate when alternatives exhausted (DL-014).
- **Implementation Impact:** Core queue-engine logic + veto state machine.
- **Risk Areas:** Veto starvation abuse (RISK; `MOD-EXTVOTE`).

### `ARCH` — §12 System Architecture
- **Purpose:** Layered architecture, selected stack, server authority, diagrams, sequence diagrams.
- **Key Concepts:** Next.js 14 + Fastify 5 + Socket.IO + PostgreSQL + Redis + Prisma + Zod + Argon2id; single deployable in MVP; server is authoritative for all room mutations; thin handlers + domain services (no Fastify objects in services); 3 sequence diagrams.
- **Dependencies:** `NFR`, `PROD`.
- **Used By:** `COMP`, `DATA`, `API`, `WS`, `DEPLOY`, `DEVOPS`.
- **Critical Decisions:** Fastify final (DL implied; §12.2); synchronous in-process service calls, event bus deferred.
- **Implementation Impact:** Defines package/process boundaries and dependency directions.
- **Risk Areas:** Single-process API+WS coupling (TD-002).

### `COMP` — §13 Component Design
- **Purpose:** Responsibilities of 12 components.
- **Key Concepts:** Frontend client (tier-aware); Room, Identity/Nickname (tier issuance + in-place upgrade), Queue Engine (+states), Playback Coordinator (+state model), Chat (member-only send), Moderation, YouTube Metadata, Rate Limit (+limits table), Embeddable Room Client (read-only), External Command Service (+command tables), Outbound Bot Webhook Service.
- **Dependencies:** `ARCH`, `FR`, `ROLE`.
- **Used By:** `API`, `WS`, `DATA`, `TRACE`, `MILE`.
- **Critical Decisions:** Identity Service is the tier authority (FR-028, NFR-038); embeds never trust browser identity.
- **Implementation Impact:** Maps directly to service modules.
- **Risk Areas:** Cross-service coupling; metadata staleness (TD-004).

### `DATA` — §14 Data Model
- **Purpose:** 17 tables, `external_chat_music` JSONB schema, migration strategy.
- **Key Concepts:** ER overview; `room_sessions.access_tier` + constraints; veto tables; external participant mute fields; JSONB documented + Zod-validated; Prisma Migrate; expand-contract zero-downtime; manual rollbacks.
- **Dependencies:** `COMP`, `ARCH`.
- **Used By:** `API`, `WS`, `TRACE`, `DEVOPS`.
- **Critical Decisions:** Retain JSONB for MVP (decomposition deferred, TD-001); per-integration-per-room external scope (DL-012).
- **Implementation Impact:** Schema source of truth; CHECK + app-layer constraints for tier integrity.
- **Open Questions:** `embedMode`/`songRequestPolicy.mode` enums differ from §13.10/§11.10 — see §1.4.

### `API` — §15 API Design
- **Purpose:** REST conventions + endpoints by group.
- **Key Concepts:** `/api/` versioning; cursor pagination; rate-limit headers; request-id correlation; naming conventions; `/listen` (listener) vs `/join` (member, protect-and-join, upgrade-in-place); queue/chat/moderation/integration endpoints; `site-command` server-to-server.
- **Dependencies:** `FR`, `ROLE`, `DATA`, `ERR` (envelopes/codes).
- **Used By:** `WS`, `TRACE`, `TEST`, `DEVOPS`.
- **Critical Decisions:** `409 NICKNAME_PROTECTION_REQUIRED` / `403 LISTENER_READ_ONLY` for gated actions.
- **Implementation Impact:** Route contracts + status conventions.
- **Open Questions:** Path examples mix `/api/` and `/api/`; treat §15.1.1 (v1) as authoritative.

### `WS` — §16 WebSocket Event Design
- **Purpose:** Connection, reconnection backoff, client/server event families.
- **Key Concepts:** Token-in-query connect; reconnection (exp backoff + jitter, phases); C2S events with **minimum native tier**; S2C events incl. veto + integration + moderation; `room.snapshot` on reconnect; tier re-derived from token on every event (NFR-038).
- **Dependencies:** `API`, `ROLE` (tiers), `ERR`.
- **Used By:** `COMP`, `TRACE`, `TEST` (WS tests).
- **Critical Decisions:** Listener connections may only emit `playback.clientState`/`presence.heartbeat`; member-only events rejected `LISTENER_READ_ONLY`.
- **Implementation Impact:** Realtime authorization + reconnection state machine.
- **Risk Areas:** Forged tier claims (`SEC-TIER`).

### `ALGO` — §17 Queue Selection Algorithms
- **Purpose:** Per-mechanic next-track selection + veto advance cycle.
- **Key Concepts:** FIFO, voting (score + tie-breakers + decay), DJ rotation eligibility, host-curated, suggestion approval, pre-play veto advance.
- **Dependencies:** `MECH`, `COMP` (Queue Engine).
- **Used By:** `COMP`, `TEST`.
- **Critical Decisions:** Tie-break order; vetoed song not reselected same cycle.
- **Implementation Impact:** Deterministic selection logic.
- **Risk Areas:** Edge cases at queue boundaries.

### `SYNC` — §18 Playback Synchronization
- **Purpose:** Server time model, client resync, autoplay limits.
- **Key Concepts:** Server-authoritative approximate position; client seeks to server estimate; 1–3s tolerance; autoplay gesture requirement.
- **Dependencies:** `ASM`, `COMP` (Playback Coordinator).
- **Used By:** `WS` (playback events), `TEST`, `DEBT` (LIM-004).
- **Critical Decisions:** No hard sample-accurate sync (DL-010, LIM-004).
- **Implementation Impact:** Resync cadence + position estimation.
- **Risk Areas:** Drift on poor networks (RISK).

### `SEC` — §19 Security Design
- **Purpose:** Threat model, mitigations, password storage, sessions, **authoritative external-integration security (§19.5)**, CORS/CSP.
- **Key Concepts:** 16 threats incl. listener escalation; Argon2id; signed httpOnly cookies + short-lived WS tokens with tier; §19.5 defense-in-depth (HMAC/bearer, freshness, idempotency, replay, schema validation, rate limits, sanitization, audit, signed webhooks, embed token ≠ secret, origin allowlist, frame-ancestors); native + per-integration embed CSP; frame/header policy.
- **Dependencies:** `NFR` (030–038), `ROLE`, `DATA`, `ARCH`.
- **Used By:** `MOD`, `API`, `WS`, `AC` (31.7/31.9 ref 19.5), `TRACE`.
- **Critical Decisions:** §19.5 is the single authoritative source; precedence over downstream references.
- **Implementation Impact:** Auth middleware, secret handling, header/CSP config.
- **Risk Areas:** Reference copies diverging from §19.5; CSP exceptions reaching production.

### `MOD` — §20 Abuse Prevention and Moderation Policy
- **Purpose:** Abuse scenarios + native and external controls.
- **Key Concepts:** 14 scenarios; native controls (protected-nickname gate, rate limits, duration/duplicate, audit); external controls grouped: command bridge, queue, vote, staff, embed; lazy mute auto-expiry.
- **Dependencies:** `SEC-EXTINTEG` (authoritative), `FR` (070s/080s/170s), `ROLE`.
- **Used By:** `AC` (31.9), `OBS`, `RISK`, `TRACE`.
- **Critical Decisions:** Mute auto-expiry checked lazily (no timer infra); permanent mutes need explicit syntax.
- **Implementation Impact:** Layered rate-limit + moderation enforcement.
- **Risk Areas:** Accidental permanent mute (RISK); veto coordination abuse.

### `PRIV` — §21 Privacy Design
- **Purpose:** Data collected/not collected, retention.
- **Key Concepts:** Minimal identity; Listeners hold no nickname/hash; pseudonymous external user IDs; no email/OAuth/payment; retention defaults table; disclosures.
- **Dependencies:** `ASM`, `DATA`, `SEC`.
- **Used By:** `YT` (compliance), `AC`, `TRACE`, `RISK`.
- **Critical Decisions:** External IDs pseudonymous; public payloads never expose secrets/IPs/session IDs.
- **Implementation Impact:** Field-level redaction + retention jobs.
- **Risk Areas:** Over-collection; IP handling.

### `YT` — §22 YouTube Integration Design
- **Purpose:** Playback, metadata, search, compliance checklist.
- **Key Concepts:** IFrame player only; server-side metadata with caching; search deferred (quota); compliance: no download/cache/re-stream; attribution + quota monitoring.
- **Dependencies:** `ASM`, `NFR` (050–053), `COMP` (YouTube Metadata).
- **Used By:** `ERR-CIRCUIT` (YouTube breaker), `TRACE`, `RISK`.
- **Critical Decisions:** URL-paste before in-app search (DL/RECDEC); aggressive metadata caching within policy.
- **Implementation Impact:** Metadata service + degraded-mode partial metadata.
- **Risk Areas:** Quota exhaustion; embed restrictions (RISK).

### `ERR` — §23 Error Handling and Resilience
- **Purpose:** Error envelopes, **formal error code registry (§23.4)**, circuit breakers & degradation.
- **Key Concepts:** REST/WS/external envelopes; ~50 stable error codes incl. `LISTENER_READ_ONLY`, `NICKNAME_PROTECTION_REQUIRED`, `YOUTUBE_METADATA_DEGRADED`, `WEBHOOK_DELIVERY_DEFERRED`; per-dependency breakers (YouTube/Redis/PostgreSQL/webhook) with fallback + user-visible behavior; fail-closed Redis for abuse-sensitive writes.
- **Dependencies:** `NFR` (023, 036), `API`, `WS`, `YT`.
- **Used By:** `API`, `WS`, `OBS`, `TEST`, `TRACE`, `DEPLOY` (readiness).
- **Critical Decisions:** Registry is canonical; webhook failure never rolls back state.
- **Implementation Impact:** `error-codes.ts` registry; breaker state machine in health/metrics.
- **Open Questions:** `NICKNAME_REQUIRED` vs `NICKNAME_PROTECTION_REQUIRED` usage post-v1.4.0 (§1.4).

### `OBS` — §24 Observability
- **Purpose:** Metrics, logs, alerts.
- **Key Concepts:** 21 metrics incl. nickname-protection rate, external mute counts; structured logs with request/room/session-hash; never-log list; 12 alert conditions.
- **Dependencies:** `NFR` (068), `ERR`, `MOD`.
- **Used By:** `DEPLOY`, `TEST`, `RISK`.
- **Critical Decisions:** Never log secrets/passwords/tokens/host secrets.
- **Implementation Impact:** Telemetry + alerting wiring.
- **Risk Areas:** Sensitive data leakage in logs.

### `DEPLOY` — §25 Deployment Architecture
- **Purpose:** MVP topology + scaling strategy.
- **Key Concepts:** CDN + app server (REST+WS+workers) + managed PostgreSQL/Redis; stateless API; Redis pub/sub for cross-instance; sticky sessions if needed; partition hot rooms.
- **Dependencies:** `ARCH`, `NFR` (010–022).
- **Used By:** `DEVOPS`, `OBS`, `TEST` (load).
- **Critical Decisions:** Single deployable for MVP; split WS later (TD-002).
- **Implementation Impact:** Coolify/Docker packaging.
- **Risk Areas:** WS saturation affecting REST (TD-002).

### `TEST` — §26 Testing Strategy
- **Purpose:** Unit, integration, WS, E2E, load test coverage.
- **Key Concepts:** Per-layer scope incl. tier-gating, veto cycle, reconnection, external command flows, abuse scenarios, capacity.
- **Dependencies:** `FR`, `NFR`, `AC`, `TRACE`.
- **Used By:** `DEVOPS` (CI), `MILE`.
- **Critical Decisions:** Coverage tied to traceability matrix.
- **Implementation Impact:** Test plan structure.
- **Risk Areas:** Frontend coverage lighter than backend (TD-006).

### `SCOPE` — §27 MVP Scope
- **Purpose:** Must/should/post-MVP partition.
- **Key Concepts:** Must-haves (rooms, listen/protect, chat, queue, playback, mechanics, moderation); should-haves (external integration per DL-011); post-MVP features.
- **Dependencies:** `GOAL`, `FR`, `DEC`.
- **Used By:** `MILE`, `AC`.
- **Critical Decisions:** External integration is MVP should-have, native-first (DL-011).
- **Implementation Impact:** Sequencing.
- **Risk Areas:** Should-have slipping silently.

### `DEC` — §28 Decision Log
- **Purpose:** 20 resolved decisions DL-001…DL-020 with rationale.
- **Key Concepts:** Global nicknames (DL-001); host link MVP / nickname-bind Phase 2 (DL-002); 14-day expiry (DL-003); 100-message history (DL-004); upvote-only MVP (DL-006); 10-char password (DL-009); 3s sync (DL-010); per-integration-per-room external scope (DL-012); requester votes allowed (DL-013); mandatory protection (DL-019); listener chat hidden default (DL-020).
- **Dependencies:** all design sections (decisions reference them).
- **Used By:** `RECDEC`, `DEBT`, `AC`, plus Decision→Section map (§4.8).
- **Critical Decisions:** DL-019/DL-020 are the v1.4.0 core.
- **Implementation Impact:** Resolves ambiguity that would otherwise stall implementation.
- **Risk Areas:** Phase-2 reversals must update dependent sections.

### `RECDEC` — §29 Recommended Product Decisions
- **Purpose:** 15 product recommendations.
- **Key Concepts:** Free listening; protected-nickname participation (supersedes optional); clear no-recovery warning; global nicknames; safe mechanic changes; URL-paste first; read-only embeds; hybrid veto; per-user cooldown default; webhooks as side effects.
- **Dependencies:** `DEC`, `GOAL`.
- **Used By:** `AC`, `APPX-DEFAULTS`.
- **Critical Decisions:** Reinforces DL-019.
- **Implementation Impact:** Default posture.
- **Risk Areas:** none.

### `MILE` — §30 Implementation Milestones
- **Purpose:** M1–M7 with effort sizes.
- **Key Concepts:** Effort conventions (S/M/L/XL); tier model + gating land in M1 (chat/queue depend on it); M5 completes protection UX; M7 external embeds (XL); MVP 16–24 weeks (M1–M6).
- **Dependencies:** `SCOPE`, `COMP`, `DATA`, `FR`.
- **Used By:** planning; `TEST`, `DEBT` (TD-005 in M6).
- **Critical Decisions:** Core tier work front-loaded to M1.
- **Implementation Impact:** Build sequence + estimates.
- **Risk Areas:** M7 size/optionality.

### `AC` — §31 Acceptance Criteria
- **Purpose:** Verifiable criteria: audit remediation (31.0/31.0.1), v1.4.0 protection (31.0.2), per-area (31.1–31.9).
- **Key Concepts:** Listener cannot interact and gets upgrade prompt; protect-and-join; in-place upgrade; server-side enforcement (NFR-038); listener chat default hidden; external criteria ref §19.5.
- **Dependencies:** `FR`, `NFR`, `SEC-EXTINTEG`, `MECH`, `MOD`.
- **Used By:** `TEST`, `TRACE`.
- **Critical Decisions:** External AC explicitly defer authority to §19.5.
- **Implementation Impact:** Definition of done.
- **Risk Areas:** none.

### `RISK` — §32 Risks and Mitigations
- **Purpose:** Risk→impact→mitigation table.
- **Key Concepts:** Quota, embed restrictions, no-registration abuse, host link leak, forgotten passwords (now blocks participation), conversion drop, listener confusion, sync drift, XSS, external forgery, identity instability, veto abuse, staff spoofing, webhook failure, embed secret leakage, mute abuse, TTL race.
- **Dependencies:** spans `SEC`, `MOD`, `YT`, `SYNC`, `FEAT-NICKPROT`.
- **Used By:** `OBS` (alerts), `DEBT`.
- **Critical Decisions:** Mitigations reference concrete controls.
- **Implementation Impact:** Risk→mitigation map (§4.7) ties each to a control.
- **Risk Areas:** This section *is* the risk register.

### `APPX-DEFAULTS` / `APPX-MSGS` / `APPX-SNAPSHOT` — §33/34/35
- **Purpose:** Reference values, message catalog, canonical room-state JSON.
- **Key Concepts:** Default settings table; native + bot message strings; example snapshot payload.
- **Dependencies:** `MECH`, `MOD`, `WS`.
- **Used By:** implementation defaults, `WS` payload shape, `TEST` fixtures.
- **Critical Decisions:** Defaults align with DL-003/006/009/010 and veto/SR defaults.
- **Implementation Impact:** Seed values + fixtures.
- **Risk Areas:** Keep defaults in sync with `external_chat_music` schema.

### `TRACE` — §37 Requirements Traceability Matrix
- **Purpose:** Map FRs/NFRs → components, endpoints, tables, tests.
- **Key Concepts:** FR table (37.1), NFR table (37.2).
- **Dependencies:** `FR`, `NFR`, `COMP`, `API`, `DATA`, `TEST`.
- **Used By:** audits, coverage checks, code-gen scoping.
- **Critical Decisions:** Designated non-exhaustive for low-priority/Phase-2 items.
- **Implementation Impact:** Primary retrieval pivot for "which code satisfies X."
- **Open Questions:** NFR numbers/targets diverge from §8 (§1.4).

### `DEBT` — §38 Known Limitations & Technical Debt
- **Purpose:** LIM-001…007, TD-001…006, maintenance notes.
- **Key Concepts:** No password recovery (LIM-001); no directory (LIM-002); approximate sync (LIM-004); read-only embed (LIM-006); protection friction (LIM-007); JSONB blob (TD-001); single-process API+WS (TD-002); webhook DLQ no UI (TD-003); metadata not background-refreshed (TD-004); backup restore manual (TD-005); frontend coverage gap (TD-006).
- **Dependencies:** spans many sections.
- **Used By:** `MILE`, `DEC`, `REVIEW`.
- **Critical Decisions:** Each item has planned resolution + target.
- **Implementation Impact:** Backlog of accepted shortcuts.
- **Risk Areas:** Items must be revisited at milestone reviews.

### `DEVOPS` — §39 Development Operations
- **Purpose:** CI/CD, configuration, environments, dependency management.
- **Key Concepts:** Pipeline stages + branch strategy; env-var precedence + required vars; local/CI/staging/prod parity (PG16/Redis7/Node20+/pnpm 9.15.4); pnpm workspaces + Turborepo + Corepack; dependency update policy; root Prisma schema; `next.config.mjs` constraint; frozen lockfile.
- **Dependencies:** `ARCH`, `DATA`, `DEPLOY`.
- **Used By:** `TEST` (CI), onboarding.
- **Critical Decisions:** Required env vars fail-fast; lockfile reproducibility.
- **Implementation Impact:** Repo/build operability.
- **Risk Areas:** Env parity drift.

---

## 4. Cross-Reference Maps

Structured relationship tables that the SDD prose implies. Each row cites stable IDs and source IDs so an agent can jump directly.

### 4.1 Architecture ↔ Components

| Architecture layer (`ARCH` §12) | Components (`COMP` §13) | Backing data/infra |
| ------------------------------- | ----------------------- | ------------------ |
| Frontend (Next.js/React) | Frontend Client (§13.1); Embeddable Room Client (§13.10) | CDN/static |
| API layer (Fastify handlers) | thin handlers → Room, Identity, Queue, Chat, Moderation services | Prisma → PostgreSQL |
| Realtime layer (Socket.IO) | Socket.IO handlers; Presence manager | Redis pub/sub + adapter |
| Domain services | Room, Identity/Nickname, Queue Engine, Playback Coordinator, Chat, Moderation, Rate Limit, External Command, Outbound Webhook, YouTube Metadata | PostgreSQL + Redis |
| Data layer | (all services via Prisma/ioredis) | PostgreSQL 16, Redis 7 |
| External services | YouTube Metadata Service; Outbound Bot Webhook Service | YouTube Data API/IFrame; embedding-site webhooks |

Dependency directions (§12.5.3): Room→Identity; Queue Engine→Rate Limit, →Moderation; Playback Coordinator→Queue Engine; Chat→Rate Limit, →Moderation; External Command→Queue Engine/Playback/Moderation/Rate Limit; Outbound Webhook ← External Command/Playback. Services never depend on Fastify req/reply.

### 4.2 Components ↔ Data Model

| Component (`COMP`) | Tables read/written (`DATA`) |
| ------------------ | ---------------------------- |
| Room Service | `rooms` (+`external_chat_music`), `room_settings_history` |
| Identity/Nickname Service | `nickname_claims`, `room_sessions` (`access_tier`) |
| Queue Engine | `queue_items`, `queue_votes`, `tracks`, `preplay_veto_votes`, `preplay_veto_windows` |
| Playback Coordinator | `queue_items` (state/started/ended), `skip_votes` |
| Chat Service | `chat_messages` |
| Moderation Service | `room_moderation_actions`, `room_sessions` (`is_muted`/`is_banned`), `chat_messages` (delete), `queue_items` (remove) |
| YouTube Metadata Service | `tracks` |
| Rate Limit Service | Redis (no durable table) |
| External Command Service | `site_integrations`, `external_participants`, `external_commands`, `external_references` |
| Outbound Bot Webhook Service | `site_integrations` (webhook config); delivery state (Redis/worker) |

### 4.3 Data Model ↔ APIs

| Table (`DATA`) | API group / endpoint (`API`) |
| -------------- | ----------------------------- |
| `rooms` | `API-ROOMS` `POST /rooms`, `PATCH /rooms/:id/settings`, host/password verify |
| `nickname_claims` | `API-NICK` `POST /nicknames/check|protect|authenticate` |
| `room_sessions` | `API-NICK` `POST /rooms/:id/listen` (listener), `POST /rooms/:id/join` (member), `/nickname/change` |
| `queue_items`, `tracks` | `API-QUEUE` `POST/DELETE /rooms/:id/queue/items[/:id]` |
| `queue_votes` | `API-QUEUE` vote endpoint |
| `chat_messages` | `API-CHAT` `GET …/chat/messages`, `DELETE …/chat/messages/:id` |
| `room_moderation_actions` | `API-MOD` `POST …/moderation/mute|unmute|ban|unban|assign|revoke` |
| `site_integrations` | `API-INTEG` `POST/PATCH/DELETE /rooms/:id/integrations/site` |
| `external_participants`, `external_commands`, `external_references` | `API-INTEG` `POST /integrations/site-command` |
| `preplay_veto_*` | `API-INTEG` `site-command` (votes), embed snapshot |

### 4.4 APIs ↔ WebSocket Events

| API action (`API`) | Resulting WS event(s) (`WS`) |
| ------------------- | ---------------------------- |
| `POST /rooms/:id/join` / `/listen` | `presence.updated`, `room.snapshot` (on connect) |
| `POST /queue/items` | `queue.item.added`, `queue.updated` |
| `DELETE /queue/items/:id` | `queue.item.removed`, `queue.updated` |
| queue vote | `queue.vote.updated` |
| skip vote (WS `playback.skipVote`) | `playback.state` (on advance) |
| `PATCH /rooms/:id/settings` (mechanic) | `room.mechanic.changed`, `chat.message` (system) |
| `PATCH /rooms/:id/settings` (other) | `room.settings.changed` |
| moderation endpoints | `moderation.applied`, `chat.message` (moderation) |
| `POST /integrations/site-command` (`!sr`) | `queue.item.added`, `integration.command.received/accepted/rejected`, `external.bot_message.created` |
| `site-command` (`!yay`/`!nay`) | `queue.item.veto_window.updated` (or `.opened`/`.vetoed`/`.veto_passed`) |
| `site-command` (staff settings) | `room.external_settings.changed`, `external.bot_message.created` |
| auto-advance (server) | `queue.item.veto_window.opened` → `playback.state` |

### 4.5 Security ↔ Functional Requirements

| Security control (`SEC`) | Enforces / protects FR–NFR |
| ------------------------ | -------------------------- |
| `SEC-TIER` (server-side tier gate) | FR-010, FR-019, FR-028, FR-071, FR-078, NFR-038 |
| `SEC-PWD` (Argon2id) | FR-021, NFR-030 |
| `SEC-SESSION` (signed httpOnly + WS token w/ tier) | FR-003, NFR-031, NFR-032 |
| `SEC-EXTINTEG` (§19.5 authoritative) | FR-114, FR-116, FR-170, FR-171, FR-176, FR-179, NFR-061–066 |
| `SEC-CORS` | NFR-037, FR-178 |
| `SEC-CSP` / `SEC-FRAME` | NFR-037, FR-178, FR-179 |
| Rate limiting (`COMP` §13.9) | FR-023, FR-073, NFR-035, FR-172 |
| Sanitization | FR-175, NFR-034 |
| Audit logging | FR-085, FR-156, FR-167, FR-177, NFR-067 |
| `ERR-CIRCUIT` (breakers) | NFR-021, NFR-023 |

### 4.6 Acceptance Criteria ↔ Requirements

| AC area (`AC` §31) | Verifies (`FR`/`NFR`) |
| ------------------ | --------------------- |
| 31.0 Priority 1 | NFR-036, NFR-037, NFR-023; framework + permission-matrix coverage |
| 31.0.1 Priority 2 | diagrams, `DATA-MIGRATE`, `API-CONV`, `WS-CONN`, `SEC-EXTINTEG`, `DEC`, `MILE`, `TRACE` |
| 31.0.2 v1.4.0 protection | FR-010, FR-019, FR-028, FR-029, FR-078, NFR-038, DL-019, DL-020 |
| 31.1 Room creation | FR-001, FR-002, FR-003 (host needs protected nickname) |
| 31.2 Room join | FR-010, FR-011, FR-014, FR-015, FR-019, FR-023 |
| 31.3 Chat | FR-070, FR-071, FR-072, FR-076, FR-078 |
| 31.4 Queue | FR-030, FR-033, FR-034, FR-037 |
| 31.5 Playback | FR-040, FR-041, FR-042, FR-044 |
| 31.6 Mechanic changes | FR-055, FR-056, FR-057, FR-058 |
| 31.7 External integration | FR-110–119 (ref `SEC-EXTINTEG`) |
| 31.8 Pre-play veto | FR-130–143 |
| 31.9 Staff commands & abuse | FR-150–168, FR-170–179 (ref `SEC-EXTINTEG`, `MOD`) |

### 4.7 Risks ↔ Mitigations

| Risk (`RISK` §32) | Mitigation control (stable ID / source) |
| ----------------- | ---------------------------------------- |
| YouTube quota exhaustion | URL-paste first, cache (`YT`); `ERR-CIRCUIT` YouTube breaker; NFR-053 |
| YouTube embed restrictions | Detect/mark failed/skip (`FEAT-PLAYBACK`, FR-037, FR-046) |
| No-registration abuse | `FEAT-NICKPROT` gate, rate limits (`COMP` §13.9), `MOD-NATIVE` |
| Host link leaked | Hash-only host secret; rotation + nickname bind Phase 2 (DL-002, `SEC`) |
| Forgotten nickname passwords | Up-front warning (FR-025), no recovery MVP (LIM-001) |
| Mandatory protection lowers conversion | Free listening, one-step protect-and-join, inline prompts (FR-029, LIM-007) |
| Listener confusion | Upgrade prompts not silent failure (FR-029) |
| Playback drift | Resync + server authority (`SYNC`, LIM-004) |
| XSS | Escape/sanitize + CSP (`SEC-CSP`, NFR-034) |
| External command forgery | `SEC-EXTINTEG` HMAC/freshness/replay/idempotency |
| External identity instability | Require stable external user IDs (DL-015, `MOD-EXTVOTE`) |
| Veto abuse | Hybrid threshold, eligibility, no-alternate rule (`MECH`, DL-014, `MOD-EXTVOTE`) |
| Staff role spoofing | Allowlists + trusted role mapping (`MOD-EXTSTAFF`, `SEC-EXTINTEG`) |
| Webhook failure | Retry/backoff, no rollback (`COMP` §13.12, NFR-061, DL-017) |
| Embed secret leakage | Public token ≠ secret; no browser secrets (`SEC-EXTINTEG`, `MOD-EXTEMBED`) |
| Mute abuse / accidental permanent mute | Rate-limit + audit + explicit duration + early unmute (`MOD-EXTMUTE`, FR-164/166) |
| TTL auto-expiry race | Lazy check on next command + periodic cleanup (§20.3, §10.18) |
| Listener privilege escalation | `SEC-TIER` token-derived gate (NFR-038, FR-028) |

### 4.8 Decision Log ↔ Affected Sections

| Decision | Affects (stable IDs) |
| -------- | -------------------- |
| DL-001 Global nicknames | `DATA-NICKNAMES`, `FEAT-NICKPROT`, `RECDEC` |
| DL-002 Host authority model | `FEAT-ROOMCREATE`, `SEC-SESSION`, `RISK` |
| DL-003 14-day expiry | `DATA-ROOMS`, `PRIV` (retention), `APPX-DEFAULTS` |
| DL-004 100-message history | `DATA-CHAT`, `API-CHAT` (pagination) |
| DL-005 Directory Phase 2 | `SCOPE`, `DEBT` (LIM-002) |
| DL-006 Upvote-only MVP | `MECH` (voting), `DATA-VOTES` |
| DL-007 No default suggestions in host-curated | `MECH` (host-curated/suggestions) |
| DL-008 Reserved-name blocking | `COMP` §13.3 (nickname constraints) |
| DL-009 10-char password | `FEAT-NICKPROT`, `APPX-DEFAULTS` |
| DL-010 3s sync | `SYNC`, `DEBT` (LIM-004), NFR-004 |
| DL-011 External integration MVP should-have | `SCOPE`, `MILE` (M7) |
| DL-012 Per-integration-per-room external scope | `DATA-EXTPART` (unique constraint) |
| DL-013 Requester votes allowed | `MECH` (veto), `MOD-EXTVOTE` |
| DL-014 Play last candidate on exhaustion | `MECH` §11.7, `ALGO` §17.6 |
| DL-015 Optional trust signals | `API-INTEG` payload, `MOD-EXTVOTE` |
| DL-016 Phase-2 staff confirmation | `MOD-EXTSTAFF`, `FEAT-EXTSTAFF` |
| DL-017 Webhook retry/DLQ | `COMP` §13.12, `DEBT` (TD-003) |
| DL-018 Unique command prefix | `DATA-INTEGRATIONS`, `DATA-EXTCONFIG` validation |
| DL-019 Mandatory native protection | `FEAT-NICKPROT`, `ROLE`, `UX`, `DATA-SESSIONS`, `API-NICK`, `WS-C2S`, `SEC-TIER`, `AC` 31.0.2, `DEBT` LIM-007 |
| DL-020 Listener chat hidden default | `FEAT-LISTEN`, FR-078, `DATA-ROOMS`, `ROLE`, `APPX-DEFAULTS` |

---

## 5. Recommended File Split Plan

The single `sdd.md` becomes a folder. Splitting is **non-destructive**: text moves verbatim; only headings/anchors and the two AI files are added. Files are ordered to mirror the SDD's flow, then the two AI artifacts.

```
sdd/
├── 00-front-matter.md          # title, metadata, change log, ToC
├── 01-executive-summary.md     # §1            (OVR)
├── 02-goals-and-non-goals.md   # §2            (GOAL)
├── 03-product-overview.md      # §3            (PROD)
├── 04-definitions.md           # §4            (DEF)
├── 05-assumptions.md           # §5            (ASM)
├── 06-stakeholders.md          # §6            (STK)
├── 07-functional-requirements.md   # §7        (FR)
├── 08-non-functional-requirements.md # §8      (NFR)
├── 09-roles-and-permissions.md # §9            (ROLE)
├── 10-ux-flows.md              # §10           (UX / WF-*)
├── 11-playlist-mechanics.md    # §11           (MECH)
├── 12-system-architecture.md   # §12           (ARCH)
├── 13-component-design.md      # §13           (COMP)
├── 14-data-model.md            # §14           (DATA / DATA-*)
├── 15-api-design.md            # §15           (API / API-*)
├── 16-websocket-design.md      # §16           (WS / WS-*)
├── 17-queue-algorithms.md      # §17           (ALGO)
├── 18-playback-sync.md         # §18           (SYNC)
├── 19-security-design.md       # §19           (SEC / SEC-*)  ← §19.5 authoritative
├── 20-abuse-and-moderation.md  # §20           (MOD / MOD-*)
├── 21-privacy-design.md        # §21           (PRIV)
├── 22-youtube-integration.md   # §22           (YT)
├── 23-error-and-resilience.md  # §23           (ERR / ERR-REGISTRY, ERR-CIRCUIT)
├── 24-observability.md         # §24           (OBS)
├── 25-deployment.md            # §25           (DEPLOY)
├── 26-testing-strategy.md      # §26           (TEST)
├── 27-mvp-scope.md             # §27           (SCOPE)
├── 28-decision-log.md          # §28           (DEC / DL-*)
├── 29-recommended-decisions.md # §29           (RECDEC)
├── 30-milestones.md            # §30           (MILE)
├── 31-acceptance-criteria.md   # §31           (AC)
├── 32-risks.md                 # §32           (RISK)
├── 33-appendix-a-defaults.md   # §33           (APPX-DEFAULTS)
├── 34-appendix-b-messages.md   # §34           (APPX-MSGS)
├── 35-appendix-c-snapshot.md   # §35           (APPX-SNAPSHOT)
├── 36-final-recommendation.md  # §36           (FINAL)
├── 37-appendix-d-traceability.md # §37         (TRACE)
├── 38-limitations-and-debt.md  # §38           (DEBT / LIM-*, TD-*)
├── 39-development-operations.md # §39          (DEVOPS)
├── 40-review-schedule.md       # §40           (DOC-META review)
├── trackstacc-ai-index.md      # AI sitemap (generated)
└── trackstacc-ai-reference.md  # AI compressed reference (generated)
```

### 5.1 Per-file metadata

| File | Purpose | Est. size | Primary consumers | Related files |
| ---- | ------- | --------- | ----------------- | ------------- |
| `00-front-matter.md` | Identity, versioning, change log, ToC | XS (~1.2k w) | Onboarding, reviewers | `40`, both AI files |
| `01-executive-summary.md` | Product concept & constraint | XS | All readers | `02`,`03`,`reference` |
| `02-goals-and-non-goals.md` | Scope boundaries | S | Product, scoping agents | `27`,`31` |
| `03-product-overview.md` | Two usage modes + differentiator | S | All | `09`,`12`,`19` |
| `04-definitions.md` | Glossary | S | All (terminology) | every file |
| `05-assumptions.md` | Operating assumptions | XS | Architecture, QA | `18`,`19`,`21` |
| `06-stakeholders.md` | Interests | XS | Product | `29`,`32` |
| `07-functional-requirements.md` | FR-001…179 | M | Impl, test, audit | `09`,`13`,`15`,`16`,`31`,`37` |
| `08-non-functional-requirements.md` | NFR-001…069 | S | Architecture, SRE, test | `12`,`19`,`23`,`24`,`25`,`37` |
| `09-roles-and-permissions.md` | Roles + 2 matrices | S | Authz impl, security | `04`,`07`,`19`,`16` |
| `10-ux-flows.md` | 18 flows | M | Frontend, E2E | `09`,`11`,`15`,`16` |
| `11-playlist-mechanics.md` | Mechanics, veto, thresholds, SR policy | M | Queue engine, test | `17`,`13`,`14`,`16` |
| `12-system-architecture.md` | Layers, stack, authority, diagrams | M | All engineers | `13`,`14`,`25`,`39` |
| `13-component-design.md` | 12 components | M | Impl | `12`,`14`,`15`,`16`,`37` |
| `14-data-model.md` | 17 tables + JSONB + migrations | L | DB, impl, migration | `13`,`15`,`39` |
| `15-api-design.md` | Conventions + endpoints | M | Backend, clients | `07`,`14`,`16`,`23` |
| `16-websocket-design.md` | Connection + event families | M | Realtime, frontend | `09`,`15`,`23` |
| `17-queue-algorithms.md` | Selection logic | S | Queue engine, test | `11`,`13` |
| `18-playback-sync.md` | Sync model | XS | Playback, frontend | `05`,`13`,`16` |
| `19-security-design.md` | Threats, secrets, CORS/CSP, **§19.5** | M | Security, all writes | `09`,`20`,`23`,`31` |
| `20-abuse-and-moderation.md` | Scenarios + controls | M | Moderation, security | `19`,`07`,`13`,`32` |
| `21-privacy-design.md` | Data + retention | S | Legal, DB | `05`,`14`,`22` |
| `22-youtube-integration.md` | Playback/metadata/compliance | S | YouTube service, legal | `05`,`08`,`23` |
| `23-error-and-resilience.md` | Envelopes, **registry**, breakers | M | All engineers, SRE | `15`,`16`,`24`,`25` |
| `24-observability.md` | Metrics/logs/alerts | S | SRE | `23`,`25`,`32` |
| `25-deployment.md` | Topology + scaling | XS | DevOps, SRE | `12`,`39`,`08` |
| `26-testing-strategy.md` | Test layers | S | QA, CI | `31`,`37`,`39` |
| `27-mvp-scope.md` | Must/should/post | XS | Product, planning | `02`,`30`,`28` |
| `28-decision-log.md` | DL-001…020 | M | All (rationale) | `29`,`38`,`31` |
| `29-recommended-decisions.md` | 15 recs | S | Product | `28`,`33` |
| `30-milestones.md` | M1–M7 + effort | S | Planning, leads | `27`,`13`,`14` |
| `31-acceptance-criteria.md` | Verifiable criteria | M | QA, audit | `07`,`08`,`19`,`37` |
| `32-risks.md` | Risk register | S | Leads, SRE | `19`,`20`,`24`,`38` |
| `33-appendix-a-defaults.md` | Default values | XS | Impl, seed | `11`,`14`,`20` |
| `34-appendix-b-messages.md` | Message catalog | XS | Frontend, bot | `13`,`16` |
| `35-appendix-c-snapshot.md` | Room-state JSON | XS | Frontend, test fixtures | `16`,`13` |
| `36-final-recommendation.md` | Build rec | XS | Stakeholders | `01`,`27` |
| `37-appendix-d-traceability.md` | FR/NFR → impl/test | M | Audit, code-gen | `07`,`08`,`13`,`15`,`14`,`26` |
| `38-limitations-and-debt.md` | LIM/TD register | S | Leads, review | `28`,`30`,`40` |
| `39-development-operations.md` | CI/CD, config, env, deps | M | DevOps, onboarding | `12`,`14`,`25` |
| `40-review-schedule.md` | Review cadence/history | XS | Doc owner | `00`,`38` |
| `trackstacc-ai-index.md` | Sitemap for AI retrieval | S | LLM agents | all |
| `trackstacc-ai-reference.md` | Compressed full reference | M (~3.5k w) | LLM agents (always-load) | all |

Size key: XS ≈ <0.8k words, S ≈ 0.8–1.5k, M ≈ 1.5–3k, L ≈ 3k+.

### 5.2 Splitting rules to preserve correctness

1. Keep every authoritative block intact in its file; never duplicate §19.5 — reference it.
2. Preserve all source IDs and add the stable `DOMAIN`/`DOMAIN-AREA` anchor as an HTML comment or heading suffix so links survive.
3. Each split file begins with its `AI Summary` block (Section 3 above) so a single-file load is self-describing.
4. Cross-file links use stable IDs, not section numbers.

---

## 6. LLM Retrieval and Context Strategy

### 6.1 Always load first (the base layer)

For **every** task, load in this order:
1. `trackstacc-ai-reference.md` — the compressed system model.
2. `trackstacc-ai-index.md` — to resolve the question to specific files/IDs.
3. `04-definitions.md` (`DEF`) — only if the task uses domain terms ambiguously.

This base layer is small enough to coexist with a real task and is usually sufficient to answer scoping questions and route to detail.

### 6.2 Retrieval profiles by task type

| Task type | Load after base layer (in order) |
| --------- | --------------------------------- |
| **Architecture / design review** | `12-system-architecture` (`ARCH`), `13-component-design` (`COMP`), `08-non-functional` (`NFR`), `25-deployment` (`DEPLOY`), `28-decision-log` (`DEC`) |
| **Feature implementation** | `07-functional-requirements` (relevant `FR` group), `13-component-design` (owning `COMP`), `14-data-model` (relevant `DATA-*`), `15-api-design` (relevant `API-*`), `16-websocket-design` (relevant `WS-*`), `31-acceptance-criteria` (matching `AC` area) |
| **API work** | `15-api-design` (`API-CONV` + group), `14-data-model` (backing tables), `23-error-and-resilience` (`ERR-REGISTRY`), `09-roles-and-permissions` (authz) |
| **WebSocket / realtime work** | `16-websocket-design` (`WS-CONN` + families), `09-roles-and-permissions` (tier column), `13` Playback/Chat components, `23` (WS error acks) |
| **Security review / audit** | `19-security-design` (esp. **§19.5 / `SEC-EXTINTEG`**), `09-roles-and-permissions` (`SEC-TIER`), `20-abuse-and-moderation` (`MOD`), `23-error-and-resilience` (`ERR-CIRCUIT`), `21-privacy-design` (`PRIV`) |
| **Test generation** | `31-acceptance-criteria` (`AC`), `37-appendix-d-traceability` (`TRACE`), the relevant `FR`/`NFR`, `26-testing-strategy` (`TEST`) |
| **Bug fixing** | `37-appendix-d-traceability` (find owning component/endpoint/table), then that component file + relevant `DATA`/`API`/`WS` + `23` error codes |
| **Deployment / DevOps** | `25-deployment` (`DEPLOY`), `39-development-operations` (`DEVOPS`), `14.3` (`DATA-MIGRATE`), `23.6` (`ERR-CIRCUIT`/readiness) |
| **Data / migration work** | `14-data-model` (`DATA-*` + `DATA-MIGRATE`), `39` (Prisma constraints), affected `COMP`/`API` |
| **Moderation / abuse work** | `20-abuse-and-moderation` (`MOD-*`), `19.5` (`SEC-EXTINTEG`), `13` Moderation/External Command, `10.16–10.18` mute flows |
| **External integration work** | `19.5` (`SEC-EXTINTEG`, authoritative), `13.10/13.11/13.12` (`FEAT-EMBED/EXTCMD`), `15` `API-INTEG`, `14` external tables, `11` veto + SR policy |
| **Onboarding** | base layer + `01`,`03`,`12`,`27`,`30`,`39` |

### 6.3 Worked retrieval examples

**Q: "How does nickname protection work?"**
1. `trackstacc-ai-reference.md`
2. AI Index entries for identity and permissions (`FEAT-NICKPROT`, `SEC-TIER`)
3. Sections: `09-roles-and-permissions` (§9.2.1), `07-functional-requirements` (FR-010, FR-019, FR-020–029, FR-078), `13-component-design` (§13.3 Identity Service), `14-data-model` (`DATA-SESSIONS`, `DATA-NICKNAMES`), `15-api-design` (`API-NICK`: `/listen`, `/join`), `19-security-design` (`SEC-TIER`), `23` (`LISTENER_READ_ONLY`, `NICKNAME_PROTECTION_REQUIRED`), `28` (DL-019, DL-020).

**Q: "Is the embed allowed to accept votes from the browser?"**
1. reference → 2. index (`FEAT-EMBED`, `SEC-EXTINTEG`) → 3. `13.10` (read-only embed), `19.5` (no privileged mutation from embed; vote identity from backend), `09.2.2` (Integration Bot/external matrix), `mod` vote controls. Answer: no — votes route through the server-to-server bridge with stable external user IDs.

**Q: "What happens to playback when the host changes the playlist mechanic?"**
1. reference → 2. index (`FEAT-MECHANICS`, `WF-MECHCHANGE`) → 3. `11.6` mechanic changes, `10.5` flow, `16.4` `room.mechanic.changed` event, FR-056/057/058, `17` selection. Answer: current song uninterrupted, queue order preserved, system message + audit, new mechanic applies to future ops.

**Q: "Which code satisfies FR-034 (reject duplicates)?"**
1. reference → 2. `37-appendix-d-traceability` row FR-034 → Queue Engine, `POST /queue/items`, `queue_items` → 3. open `13.4`, `15` queue endpoint, `14` `queue_items`, `rooms.duplicate_policy`, error `DUPLICATE_VIDEO`.

### 6.4 Authority & precedence rules for agents

1. **External-integration security:** `19.5` / `SEC-EXTINTEG` wins over any reference copy (§12.4, §13.11, §20.3, §31.7, §31.9).
2. **Error codes:** `23.4` / `ERR-REGISTRY` is canonical (and must stay in sync with `apps/api/src/lib/error-codes.ts`).
3. **Terminology:** `04` / `DEF` is canonical.
4. **API version:** treat `/api/` (§15.1.1) as authoritative when older `/api/...` examples appear.
5. **Decisions:** `28` / `DEC` resolves design ambiguity; cite the `DL-*` ID.
6. **Tier gate:** never weaken `SEC-TIER`; it is server-side on every request/event (NFR-038, FR-028).
7. Where §1.4 flags a body-vs-matrix or enum discrepancy, **do not silently reconcile**; surface it and ask the doc owner.

### 6.5 Proposed high-ROI documentation improvements

These are *additive* recommendations for the document owner; this transformation makes none of them to the source.

1. **Reconcile NFR targets** between §8 and Appendix D (§37.2) latency/LCP numbers, and confirm which NFR maps to which metric (§1.4). High value: tests are generated from these.
2. **Unify enums** for `embedMode` (§14.2 vs §13.10) and `songRequestPolicy.mode` (§14.2 vs §11.10), or document the mapping between storage values and product-facing modes explicitly.
3. **Clarify `NICKNAME_REQUIRED` vs `NICKNAME_PROTECTION_REQUIRED`** usage post-v1.4.0 in `ERR-REGISTRY`.
4. **Add an ER diagram with cardinalities and FKs as a single image/Mermaid block** in `14` (the §14.1 text overview is good but a diagram reduces misreads for code-gen).
5. **Embed the stable-ID anchors** into each heading (e.g. `## 9. Roles and Permissions <!-- ROLE -->`) so links survive renumbering — the change log shows renumbering is frequent.
6. **Add a one-line "Authoritative source" banner** to every section that is only a reference copy (e.g. §12.4 → "Authoritative: §19.5 / SEC-EXTINTEG").
7. **Promote the implementation-note callouts** (token tier field, error registry, request-id middleware, Prisma root schema, `next.config.mjs`) into a single `DEVOPS`/code-map appendix so bug-fixing agents find file paths in one place.
8. **Generate a machine-readable manifest** (`index.json`) mirroring `trackstacc-ai-index.md` so agentic tooling can load the routing map without parsing prose.
9. **Add explicit FR/NFR coverage gaps note** in `TRACE` (it self-declares non-exhaustive) listing which MVP FRs are intentionally untraced.
10. **Version the AI artifacts alongside the SDD** in §40's review process so the index/reference never drift from the source.

---

*End of transformation plan. See `trackstacc-ai-index.md` and `trackstacc-ai-reference.md` for the two generated artifacts.*
