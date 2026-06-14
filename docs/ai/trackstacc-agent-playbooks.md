# trackstacc-agent-playbooks.md

> **Engineering Knowledge-Graph Layer — Deliverable 7 of 7**
> Retrieval plans optimized for minimum token load and maximum correctness. For each agent type: what to **Always Load**, **Usually Load**, and **Load On Demand**, plus worked task examples that name exact files and SDD sections.
> Builds on the file split plan and retrieval strategy in `trackstacc-ai-documentation-plan.md` §5–§6 and the six knowledge-graph artifacts in this layer.

---

## The base layer (every agent, every task)

Load these first, always — they are small and resolve most routing:

1. `trackstacc-ai-index.md` — the sitemap; resolve any concept → stable ID → SDD section.
2. `trackstacc-ai-reference.md` — compressed full system (~8% of source); answers most "how does it work" questions without opening the SDD.

Then add the knowledge-graph artifact that matches the task shape:

| Task shape | Primary graph artifact |
| --- | --- |
| "implement / change requirement X" | `trackstacc-requirements-graph.md` |
| "what implements feature X" | `trackstacc-feature-maps.md` |
| "build / call endpoint X" | `trackstacc-integration-matrix.md` |
| "how do components depend / fail" | `trackstacc-architecture-dependencies.md` |
| "audit / verify security" | `trackstacc-security-controls.md` |
| "what breaks if I change X" | `trackstacc-change-impact-matrix.md` |

Only open the raw SDD (or a split file from §5 of the plan) when an artifact points you to a specific section for verbatim detail (exact schema, exact policy numbers, exact decision rationale).

**Hard rules carried into every plan:** `SEC-EXTINTEG` (SDD §19.5) is authoritative for external-integration security; `ERR-REGISTRY` (§23.4) is the canonical error list; the `SEC-TIER` gate (NFR-038 + FR-028) must never be weakened; PostgreSQL is the source of truth.

---

## 1. Backend Implementation Agent

- **Always Load:** base layer + `trackstacc-integration-matrix.md` (endpoint contracts) + `trackstacc-requirements-graph.md` (the FR being implemented).
- **Usually Load:** `trackstacc-architecture-dependencies.md` (service dependency directions, fail-closed rules); SDD §13 (component responsibilities), §14 (table schema), §23.4 (error codes to return).
- **Load On Demand:** SDD §17/§18 (queue/sync algorithms) for playback work; §19.5 for any external endpoint; §16.1.1 for WS reconnection.

**Worked task — "Implement `POST /api/rooms/:roomId/join`":**
1. `integration-matrix.md` → API-NICK `/join` row: reads `rooms`,`nickname_claims`; writes `room_sessions`(member, in-place upgrade),`nickname_claims`,Redis; emits `presence.updated`; tier listener→member; fail-closed if Redis down.
2. `requirements-graph.md` → FR-010/FR-014/FR-015 nodes for exact behavior + protect-and-join.
3. SDD §15.2 (request/response shape), §14.2 (`room_sessions.access_tier`), §19.3 (Argon2id), §23.4 (`NICKNAME_*` codes).
4. `security-controls.md` → `SEC-001`,`SEC-004`,`SEC-006` for the gate, hashing, rate limits. Do **not** weaken `SEC-001`.

---

## 2. Frontend Implementation Agent

- **Always Load:** base layer + `trackstacc-feature-maps.md` (feature → UI surface) + `trackstacc-integration-matrix.md` (which endpoints/events the UI calls).
- **Usually Load:** SDD §10 (UX flows), §13.1/§13.10 (Frontend & Embed clients), §16 (WS events to subscribe), §34 (system message copy).
- **Load On Demand:** `security-controls.md` `SEC-012` (CSP nonce constraints) and `SEC-019` (embeds carry no secrets); SDD §35 (room-state snapshot shape).

**Worked task — "Build the Listener gated-control prompt":**
1. `feature-maps.md` → FEAT-LISTEN + FEAT-NICKPROT (UI mirrors the server gate; never authoritative).
2. `requirements-graph.md` → FR-029 (inline prompt wherever an interactive control would appear) + FR-019.
3. SDD §10.2/§10.3 (join/protect flow), §34 (prompt copy), §23.4 (`LISTENER_READ_ONLY`/`NICKNAME_PROTECTION_REQUIRED` to display).
4. Reminder: the client gate is cosmetic; correctness lives server-side (`SEC-001`).

---

## 3. Database Agent

- **Always Load:** base layer + `trackstacc-integration-matrix.md` §"endpoints by table written" + SDD §14 (data model, JSONB schema, §14.3 migrations).
- **Usually Load:** `trackstacc-requirements-graph.md` reverse index ("what touches X"); `architecture-dependencies.md` §3 (PG as source of truth, no cache-authoritative rule).
- **Load On Demand:** `change-impact-matrix.md` CI-11 (resilience) for any change affecting durability; SDD §38 (TD-001 `external_chat_music` decomposition).

**Worked task — "Add a column to `room_sessions`":**
1. `requirements-graph.md` reverse index → `room_sessions` is touched by FR-010/019/028/076/090 + every gated FR via `SEC-TIER`.
2. `integration-matrix.md` → writers of `room_sessions`: `/listen`,`/join`,`/password/verify`,`/nickname/change`,moderation/*.
3. SDD §14.3 → expand-contract Prisma Migrate, zero-downtime, rollback.
4. `change-impact-matrix.md` CI-01 (tier) + CI-11 (PG source-of-truth) before merging.

---

## 4. Security Auditor Agent

- **Always Load:** base layer + `trackstacc-security-controls.md` (the `SEC-NNN` matrix) + SDD §19.5 (authoritative external).
- **Usually Load:** SDD §19 (full), §20.3 (external abuse controls), §23.6 (degradation = fail-closed), §24.2 (audit logging); `change-impact-matrix.md` for blast radius of a finding.
- **Load On Demand:** `requirements-graph.md`/`integration-matrix.md` to trace a control to its endpoints and tests.

**Worked task — "Audit external command security":**
1. `security-controls.md` → `SEC-014`…`SEC-024` cluster + §4 control→AC checklist.
2. SDD §19.5 as the single source of truth (HMAC/freshness/replay/idempotency/schema/rate-limit/sanitize/sign — items 1–13). Validate against §19.5, **never** a downstream restatement.
3. `integration-matrix.md` → `POST /integrations/site-command` security row (all error codes).
4. §37.1 FR-170–179 test areas; confirm each `SEC-NNN` Verification Method has a matching test.

---

## 5. QA / Test Generation Agent

- **Always Load:** base layer + `trackstacc-requirements-graph.md` (FR → AC mapping incl. AC-MAP) + SDD §31 (acceptance criteria) + §37.1 (test areas).
- **Usually Load:** `integration-matrix.md` (error codes + tier per endpoint → negative-path tests); SDD §26 (testing strategy), §23.4 (full error registry).
- **Load On Demand:** `feature-maps.md` Failure Modes per feature; SDD §34 (expected system-message strings for assertions).

**Worked task — "Generate tests for pre-play veto":**
1. `requirements-graph.md` → FR-130–143 node: AC `AC-VETO-1`…`AC-VETO-7`, error codes, data tables.
2. SDD §31.8 (acceptance bullets) + §34 (exact bot-message strings: "No song is currently open for veto voting." etc.) for assertions.
3. `integration-matrix.md` → `!yay`/`!nay` via `site-command`: `NO_VETO_OPEN`,`NO_ALTERNATE_FOR_VETO`,`VETO_WINDOW_CLOSED`,`VOTE_NOT_ALLOWED`.
4. SDD §17.6 (advance cycle), App. A (20s window, hybrid 25%/min-3) for boundary cases; DL-014 exhaustion path.

---

## 6. Refactoring Agent

- **Always Load:** base layer + `trackstacc-architecture-dependencies.md` (dependency directions + invariants) + `trackstacc-change-impact-matrix.md` (blast radius).
- **Usually Load:** `feature-maps.md` (feature boundaries); SDD §12.5.3 (service dependency rules — services never depend on Fastify req/reply), §13 (component contracts).
- **Load On Demand:** `requirements-graph.md`/`integration-matrix.md` to confirm a refactor preserves every FR/endpoint contract.

**Worked task — "Extract veto logic out of the Queue Engine":**
1. `architecture-dependencies.md` → Queue Engine deps (Rate Limit, Moderation, YouTube) and dependents (Playback Coordinator, External Command); §7 hotspot #4 flags the veto/advance timing coupling.
2. `change-impact-matrix.md` CI-05 (veto) + CI-02 (playback boundary) + CI-03 (alternate candidate) — full review checklist.
3. Preserve contracts: `integration-matrix.md` veto events (`queue.item.veto_window.*`) and `requirements-graph.md` FR-130–143 must remain satisfied; keep server-authoritative advance (DL-014).

---

## 7. Bug Investigation Agent

- **Always Load:** base layer + `trackstacc-integration-matrix.md` (endpoint/event behavior) + SDD §23.4 (error registry — decode the code the user reports).
- **Usually Load:** `architecture-dependencies.md` §2/§3 (failure modes + fallbacks) + SDD §23.6 (degradation rules); `change-impact-matrix.md` to find adjacent suspects.
- **Load On Demand:** `feature-maps.md` Failure Modes for the affected feature; SDD §24 (which metric/alert would have fired).

**Worked task — "Users get `SERVICE_DEGRADED` when voting externally":**
1. SDD §23.4 → `SERVICE_DEGRADED` (503) = degraded mode preventing the write.
2. `architecture-dependencies.md` §3 → Redis breaker: abuse-sensitive writes (external votes) **fail closed** when Redis is down (§23.6.2 #2) — expected behavior, not a logic bug.
3. SDD §24.3 → Redis-unavailability alert (#4) should have fired; check breaker logs/metrics (§23.6.1).
4. `change-impact-matrix.md` CI-11 confirms this is the intended fail-closed security property.

---

## 8. Performance Agent

- **Always Load:** base layer + `trackstacc-architecture-dependencies.md` (breaker timeouts, dependency hotspots) + SDD §8 NFRs + §37.2 (NFR traceability).
- **Usually Load:** SDD §25 (deployment/scaling), §18 (sync model), §16 (WS); `integration-matrix.md` (rate limits per endpoint).
- **Load On Demand:** SDD §24.1 (metrics to instrument), §26.5/§26 (load testing); App. A (default thresholds).

**Worked task — "Investigate WS event latency":**
1. SDD §8 / §37.2 → NFR-002 WebSocket p95 < 100ms (note: §8 body vs Appendix-D latency-target discrepancy, plan §1.4 — confirm the intended target first).
2. `architecture-dependencies.md` → Socket.IO Gateway depends on Redis pub/sub + adapter; Redis p95 >1s for 60s trips the breaker (§23.6).
3. SDD §16 (event families), §18 (3s sync, DL-010), §25.2 (scaling).
4. SDD §24.1 → instrument WebSocket connections (#3), messages/sec (#4); §24.3 disconnect-spike alert (#2).

---

## Token-economy guidance

- The **base layer + one graph artifact** answers the large majority of engineering questions; that is the default working set. Avoid opening the 4,242-line SDD unless an artifact cites a specific section for verbatim detail.
- Graph artifacts are cross-linked by stable ID, so you can hop (requirement → endpoint → security control → impact) **without** re-reading source prose.
- When a task spans features, load the `change-impact-matrix.md` entry first — its Review block is the minimal correct checklist and tells you exactly which other artifacts/sections you must open.
- For verbatim authority on contested topics, go straight to the source of truth: external security → §19.5; error codes → §23.4; defaults → App. A; decisions → §28. Never rely on a restatement when these are available.
