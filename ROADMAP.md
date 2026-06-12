# ROADMAP

> Last updated: 2026-06-12  
> Product: **trackstacc.live**  
> Scope posture: **native-first MVP**, external integrations after the native experience is stable

## 1. Product direction

Trackstacc is a no-registration collaborative YouTube listening-room app. The core promise is simple:

- anyone can **open a room and listen immediately**
- native users must hold a **protected nickname** before they can interact
- the server remains authoritative for **sessions, permissions, queue, playback, moderation, and rate limits**
- external embeds and chat commands are valuable, but they should not delay a solid native MVP

This roadmap is optimized for the current repo shape, the latest SDD, and a practical delivery path for a small team or solo builder using AI coding agents.

---

## 2. Planning principles

1. **Native MVP before external scope**
   The first public launch should prioritize the native room experience: create room, listen, protect/join, chat, queue, playback, mechanics, moderation, and basic hardening.

2. **Correctness before breadth**
   Session, access-tier, presence, and realtime correctness come before adding more visible features. A larger feature surface on top of unstable room identity or presence will create churn.

3. **Server authority is non-negotiable**
   The API owns authz, access tier, queue state, playback state, moderation state, and rate limits. The client may optimize UX, but it never defines truth.

4. **Low-friction onboarding is a product advantage**
   Free listening stays frictionless. Protected nicknames are required only for native participation. Any UX or product change that adds friction to listening should be treated with skepticism.

5. **External integrations are a second launch**
   External embeds and signed chat-command integrations are important, but they should be delivered as a separate milestone after native MVP quality is acceptable.

---

## 3. Current state snapshot

Based on the repo and current project planning, the codebase already has a meaningful amount of foundation work in place:

- monorepo, CI, Prisma, Docker, Fastify API, Next.js frontend, shared packages
- room creation and room snapshot flow
- protected nickname primitives
- Listener/member access-tier model in schema and contracts
- listener session creation and member upgrade flow
- server-side REST/WebSocket access-tier enforcement
- in-room protect-and-join UI path
- queue add/remove/vote foundations
- room settings persistence
- health/readiness endpoints and Docker builds

That said, the practical near-term priority is **stabilization**, not pretending the foundation is finished. Known behavior reported in active use includes:

- same-session reopen / refresh can incorrectly gate host or member controls
- participant presence can remain stale after disconnect
- Listener refresh can create duplicate participant entries
- participant-list correctness is not yet reliable enough to build later mechanics on top of confidently

So the roadmap below treats **stabilization of Epics 1–2 and early Epic 3** as the true starting point.

---

## 4. Delivery tracks

The roadmap is organized across four parallel tracks. Every phase below should pull work from all four, but only in the priority order listed.

### A. Core room experience
Room creation, join/listen, protect-and-join, queue, playback, mechanics, settings, moderation.

### B. Realtime correctness
Session rehydration, token rotation, presence lifecycle, reconnect behavior, snapshot correctness, event guardrails.

### C. Trust, safety, and resilience
Rate limits, error envelopes, degraded-mode behavior, compliance pages, observability, moderation, operational readiness.

### D. External expansion
Read-only embed, signed command bridge, veto, staff commands, outbound webhooks, abuse controls.

---

## 5. Phase roadmap

## Phase 0 — Stabilize the native foundation
**Goal:** make the current Listener/member and same-session room model reliable enough to build on.

### Priority outcomes
- preserve authenticated room authority across same-session reopen and refresh
- fix native presence lifecycle on disconnect, refresh, and reconnect
- eliminate duplicate Listener/member participant rows caused by refresh/rejoin bugs
- ensure room snapshot rehydration is consistent after tab close, reload, reconnect, and token replacement
- reconcile repo docs so the actual implementation status is clear

### Why this phase exists
The current product direction depends on the native two-tier model. If host/member rehydration and participant presence are unreliable, every later feature becomes harder to test and trust.

### Exit criteria
- host and member controls survive same-browser-session reopen / refresh
- participants disappear from the visible list after the expected disconnect lifecycle
- repeated Listener refresh does not create duplicate presence entries
- room snapshot and access-tier state converge correctly after reconnect
- README / repo-map / AGENTS / roadmap tell one consistent story

### Suggested issue bucket
- fix: preserve authenticated room authority across same-session reopen and refresh
- fix: reconcile native presence lifecycle on disconnect, refresh, and reconnect
- docs: reconcile Epic 1/2 access-tier and API contract docs with implemented repo state
- test: add Epic 1/2 native access-tier regression coverage

---

## Phase 1 — Chat and presence that are safe to ship
**Goal:** complete the first truly social version of the room.

### Priority outcomes
- member-only realtime chat
- listener chat read visibility via `listener_chat_visible`
- system messages for join / protect / nickname change / mechanic changes / moderation actions
- presence heartbeat and timeout behavior
- mute support
- chat rate limiting and sanitization

### Product result
A room feels alive even before queue and playback depth are complete. Users can join, identify, chat, and see who is present.

### Exit criteria
- members can send chat messages in realtime
- Listeners cannot send chat, and read access follows room settings
- presence list is accurate enough for real use
- muted users cannot chat
- chat is rate-limited, sanitized, and covered by automated tests

### Notes
This is the first milestone where the product begins to feel genuinely multiplayer rather than infrastructural.

---

## Phase 2 — Shared queue and authoritative playback
**Goal:** make Trackstacc fulfill its core promise as a collaborative YouTube room.

### Priority outcomes
- YouTube URL parsing and video ID validation
- metadata fetch/cache with graceful degradation
- member-only queue item creation
- queue rendering and queue broadcast updates
- authoritative playback state
- track-end advance and host skip
- duplicate and max-duration policies

### Product result
Users can add songs, see a shared queue, and experience synchronized room playback governed by the server.

### Exit criteria
- users can add valid YouTube tracks to the queue
- queue updates are visible to all connected clients
- playback state is shared and resync behavior is acceptable
- invalid, too-long, duplicate, or unavailable videos are handled predictably
- core queue/playback flows pass integration and browser tests

### Notes
This is the most important feature milestone for the product’s core value.

---

## Phase 3 — Mechanics, host control, and native hardening
**Goal:** turn the basic room into a controllable product that can survive semi-public usage.

### Priority outcomes
- voting queue
- host-curated mode and queue lock
- mechanic change flow with guardrails
- room settings update API + UI
- moderation actions with audit log
- observability, logs, and health posture
- circuit breakers and degraded-mode behavior
- terms, privacy, and YouTube compliance pages

### Product result
Hosts can operate rooms intentionally, not just watch them happen. Public or semi-public usage becomes more realistic.

### Exit criteria
- at least FIFO, voting, and host-curated mechanics are stable
- settings changes persist, broadcast, and respect authorization
- moderation actions are auditable and visible where appropriate
- observability covers core native flows
- native MVP launch has a compliance and resilience baseline

### Notes
This phase is where Trackstacc becomes a launchable native product rather than a feature demo.

---

## Phase 4 — Native MVP launch readiness
**Goal:** freeze scope, close regressions, and prepare for first real usage.

### Priority outcomes
- native Playwright regression suite
- launch bug sweep
- onboarding / messaging polish around protected nicknames
- decision on staging-only vs staging + production rollout
- runbook for key incidents: Redis down, PostgreSQL unavailable, YouTube metadata degraded, reconnect spikes

### Product result
The native MVP has an explicit launch bar instead of an endless stream of feature additions.

### Exit criteria
- native MVP acceptance flows are automated
- no known P0/P1 auth, queue, playback, or presence bugs remain open
- launch environment decision is made
- basic incident and rollback posture exists
- roadmap is updated for post-launch prioritization

### Native MVP launch scope
A room host can create a room, protect/join, manage settings, chat, moderate, add songs, run a shared queue, and share playback with acceptable stability. Listening remains frictionless. Protected participation works. Realtime behavior is trustworthy enough for real users.

---

## Phase 5 — External integrations (second launch)
**Goal:** extend Trackstacc into embedded communities without weakening the native model.

### Priority outcomes
- external site integration model and config
- read-only room embed
- signed inbound site-command authentication and replay protection
- public external commands like `!sr`, `!song`, `!queue`
- signed outbound bot webhooks
- pre-play veto
- staff commands
- timed external mute / early unmute
- external integration regression harness

### Product result
Trackstacc becomes a backend music-room engine for third-party communities, not just a native web app.

### Exit criteria
- external commands are authenticated, authorized, idempotent, and rate-limited
- embeds are read-only and carry no secrets
- bot webhooks do not affect accepted room-state mutations
- staff actions are auditable
- external regressions are covered by tests

### Notes
This should be treated as a distinct launch. It has a bigger security and abuse surface than native MVP.

---

## 6. Milestone map

| Roadmap phase | Closest SDD milestone(s) | Delivery intent |
| --- | --- | --- |
| Phase 0 — Stabilize native foundation | M1 + early M5 cleanup | make the existing tier/session model reliable |
| Phase 1 — Chat and presence | M2 | social baseline |
| Phase 2 — Queue and playback | M3 | core product value |
| Phase 3 — Mechanics and hardening | M4 + M6 | launchable native product |
| Phase 4 — Native MVP launch readiness | M6 + regression hardening | first public launch |
| Phase 5 — External integrations | M7 | second launch / expansion |

---

## 7. What is intentionally deferred

These items are valuable, but they should not dilute the native MVP push:

- full external integration suite before native stability is acceptable
- public room directory
- mobile-native apps
- password recovery system
- richer account / trust / profile features
- Phase 2 slash-command depth on the native site
- advanced moderation dashboard or webhook operations dashboard
- identity-bridged interactive embeds

---

## 8. Key decisions to protect

The roadmap assumes these decisions remain in force unless the SDD is explicitly revised:

- **free listening, protected participation**
- **mandatory native nickname protection for interactive actions**
- **listener chat hidden by default**
- **global nicknames**
- **host/moderator authority requires member-tier authentication**
- **server-side authority for all writes**
- **native-first MVP; external integrations are important but can follow**

If any of these change, the roadmap should be revised rather than patched around quietly.

---

## 9. Risk watchlist

These risks deserve explicit monitoring throughout delivery:

### Product risks
- protected nicknames may reduce participation conversion
- no password recovery may cause support friction
- listener confusion if controls appear interactive before upgrade

### Technical risks
- reconnect and presence correctness can erode trust quickly
- Redis degradation affects rate limits, presence, and realtime coordination
- YouTube metadata and playback reliability can create inconsistent queue behavior
- frontend coverage lag can hide regressions that backend tests miss

### Delivery risks
- external integrations can pull attention away from native MVP
- unresolved doc drift can cause bad AI-agent prompts and wasted implementation cycles
- adding mechanics before queue/playback correctness is stable will increase churn

---

## 10. Success metrics by stage

### Native foundation healthy
- no same-session host/member downgrade bugs
- no refresh-driven participant duplication
- listener/member access-tier tests are stable in CI

### Social room baseline healthy
- chat send latency and delivery feel real-time
- participant list is trustworthy
- muted and listener-gated behavior is correct

### Core product healthy
- users can add tracks and see authoritative queue/playback updates
- metadata degradation does not break the room
- queue/playback regressions are caught by automation

### Native MVP healthy
- hosts can run rooms without manual admin intervention
- moderation and settings are usable
- launch blockers are triaged, finite, and visible

### External expansion healthy
- no secret leakage to embeds
- signed command path is resistant to replay and spoofing
- webhook failures do not corrupt room state

---

## 11. Working cadence

For this project, the recommended operating rhythm is:

- keep **WIP extremely low**
- prefer **PR-sized, self-contained cards**
- land **fixes before new surfaces**
- update this roadmap **at the end of each milestone or after any major scope decision**
- treat any production-facing incident or major design correction as a roadmap review trigger

---

## 12. Immediate next-up recommendation

If work starts today, the highest-leverage order is:

1. stabilize same-session host/member rehydration
2. fix participant presence cleanup and refresh dedupe
3. add regression coverage for access-tier and presence lifecycle
4. finish chat + presence
5. finish queue + playback
6. finish mechanics + moderation + launch hardening
7. decide whether external integrations are launch scope or post-launch scope

That sequence keeps Trackstacc aligned with its strongest product story: **instant listening, protected participation, trustworthy shared playback**.
