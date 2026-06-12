# MILESTONES.md

> Last updated: 2026-06-12  
> Product: **trackstacc.live**  
> Canonical milestone source: SDD §30 (Implementation Milestones)  
> This file translates the SDD milestone model into a repo-facing execution plan that matches `ROADMAP.md`.

## 1. How to use this file

This document is the milestone companion to `ROADMAP.md`.

- `ROADMAP.md` explains **why** work is ordered the way it is.
- `MILESTONES.md` explains **what each milestone must deliver**, how to tell when it is done, and what is currently believed to be in or out of scope.

This file intentionally keeps the official **M1–M7** structure from the SDD, while adding practical project-management details:

- current status
- milestone outcomes
- exit criteria
- suggested issue buckets
- key risks and dependencies

---

## 2. Milestone status snapshot

| Milestone | Name | SDD effort | Working status | Launch relevance |
| --- | --- | --- | --- | --- |
| M1 | Foundation | M | **Partially implemented; stabilization still required** | Critical |
| M2 | Chat and Presence | S | **Partially started / not yet trustworthy end-to-end** | Critical |
| M3 | YouTube Queue and Playback | M | **Partially started** | Critical |
| M4 | Playlist Mechanics | M | **Planned** | Critical |
| M5 | Nickname Protection UX | M | **Partially implemented; needs hardening and regression coverage** | Critical |
| M6 | Moderation and Hardening | M | **Planned** | Critical |
| M7 | External Embeds and Chat Integrations | XL | **Planned; second launch** | Optional for first public native launch |

## Reading the status labels

- **Partially implemented** means meaningful code already exists in the repo, but the milestone should not be treated as done.
- **Stabilization still required** means the core capability exists but known correctness issues block sign-off.
- **Critical** means required for the intended native MVP launch.
- **Optional for first public native launch** means the milestone is valuable, but should follow a stable native MVP unless strategy changes.

---

## 3. M1 — Foundation

**SDD intent:** Foundation  
**SDD effort:** M (2–4 weeks)

### SDD-defined scope
1. Project setup.
2. Database schema, including `room_sessions.access_tier` and `rooms.listener_chat_visible`.
3. Room creation.
4. Listener session (`/listen`) and member join/upgrade flow with the two-tier access model.
5. Session management with tier encoded in the signed token and server-side tier gating middleware.
6. WebSocket connection and tier-aware room snapshot.

### Repo-facing interpretation
This milestone establishes the real minimum platform for the product:

- the repo builds and validates cleanly
- a room can be created
- a user can open the room as a Listener
- a Listener can upgrade to member
- the server enforces the native tier model
- the client can connect to realtime and receive a usable snapshot

### Current status
**Partially implemented; stabilization still required**

Working evidence in the repo suggests M1 is mostly present in code shape:

- room creation exists
- Listener/member access tier exists in schema and contracts
- listener session creation exists
- join/upgrade flow exists
- REST/WebSocket access-tier enforcement exists
- room snapshot on connect exists

However, the milestone should not be marked complete until the known session/tier correctness issues are resolved.

### Known gaps blocking sign-off
- same-session reopen / refresh can incorrectly gate host or member controls
- same-session reopen can misclassify a valid authenticated room actor as Listener
- participant lifecycle around reconnect is not yet stable enough to confidently call the tier/session model complete

### Exit criteria
- room creation works end-to-end
- Listener open-room flow works end-to-end
- member join/upgrade works end-to-end
- host and member same-session reopen / refresh preserve the correct authority level
- tier-aware room snapshot is reliable on connect and reconnect
- server-side REST and WebSocket tier guards are covered by automated tests
- docs accurately describe the implemented route and access-tier model

### Suggested issue bucket
- fix same-session host/member rehydration
- docs sync for tier model and route contract
- regression tests for native access-tier invariants

### Depends on
- CI / env contract
- schema and token primitives
- room/session bootstrap correctness

### Enables
- M2 chat and presence
- M3 queue and playback
- all later native work

---

## 4. M2 — Chat and Presence

**SDD intent:** Chat and Presence  
**SDD effort:** S (1–2 weeks)

### SDD-defined scope
1. Real-time chat (member-tier send only; Listener visibility gated by `listener_chat_visible`).
2. System messages.
3. Presence list.
4. Chat rate limiting.
5. Mute support.

### Repo-facing interpretation
This milestone is where the room first becomes socially useful:

- protected members can chat
- Listeners see the right read-only experience
- the room knows who is present
- system activity is visible
- abuse controls exist for chat

### Current status
**Partially started / not yet trustworthy end-to-end**

Parts of the room shell, tier model, and listener gating appear to be in place, but the participant list is currently known to be incorrect under disconnect and refresh scenarios. That means presence cannot be treated as shippable yet.

### Known gaps blocking sign-off
- participant rows linger after users close the room
- Listener refresh can create duplicate presence entries
- reconnect may append rather than reconcile existing room presence
- chat may depend on presence/session correctness that is not yet fully stabilized

### Exit criteria
- members can send and receive realtime chat messages
- Listeners cannot send chat
- `listener_chat_visible` is respected correctly
- system messages appear for important room events
- participant list converges correctly after connect, disconnect, refresh, and reconnect
- mute support works
- chat is rate-limited and sanitized
- automated tests cover presence lifecycle and listener/member chat gating

### Suggested issue bucket
- presence lifecycle dedupe and cleanup
- member-only realtime chat
- chat history and listener read visibility
- rate limiting and sanitization
- mute enforcement

### Depends on
- M1 tier/session correctness

### Enables
- richer room usability
- M4 mechanics that rely on active-participant state
- stronger native MVP confidence

---

## 5. M3 — YouTube Queue and Playback

**SDD intent:** YouTube Queue and Playback  
**SDD effort:** M (2–4 weeks)

### SDD-defined scope
1. YouTube URL parser.
2. Metadata fetch/cache.
3. Queue item creation.
4. YouTube player integration.
5. Playback state broadcast.
6. Track end/skip handling.

### Repo-facing interpretation
This milestone delivers the heart of the product:

- members can add valid YouTube tracks
- everyone can see a shared queue
- playback state is authoritative and shared
- room playback advances correctly

### Current status
**Partially started**

The repo already advertises queue add/remove/vote foundations and playback-related backend support, but the milestone should not be called complete until the full shared queue and authoritative playback loop are stable in real use.

### Risks blocking sign-off
- queue/playback behavior built on top of unstable presence or reconnect logic can appear inconsistent
- YouTube metadata degradation must fail gracefully
- frontend surface may lag backend support

### Exit criteria
- valid YouTube URLs can be added by eligible members
- metadata is fetched or degrades predictably
- queue changes broadcast to connected clients
- the player reflects the authoritative current track
- track end and host skip advance correctly
- invalid / unavailable / too-long / duplicate tracks are handled correctly
- queue/playback regressions are covered by automated tests

### Suggested issue bucket
- URL parsing + metadata cache
- member-only FIFO add flow
- queue UI + queue broadcast
- authoritative playback state
- end-of-track advance and host skip
- duplicate and max-duration policy enforcement

### Depends on
- M1 tier/session correctness
- enough M2 stability that realtime behavior is trustworthy

### Enables
- core collaborative product value
- M4 mechanics
- native MVP launch viability

---

## 6. M4 — Playlist Mechanics

**SDD intent:** Playlist Mechanics  
**SDD effort:** M (2–4 weeks)

### SDD-defined scope
1. FIFO mode.
2. Voting mode.
3. Host-curated mode.
4. Mechanic change flow.
5. Queue transition policies.
6. System/audit messages.

### Repo-facing interpretation
This milestone turns a basic queue into a host-controllable room product.

### Current status
**Planned**

The roadmap assumes FIFO, voting, and host-curated are the priority mechanics for native MVP. DJ rotation can remain deferred unless product strategy changes.

### Exit criteria
- FIFO mode is stable
- voting mode is stable
- host-curated mode is stable
- host can change mechanics without interrupting the current song
- queue transition behavior is predictable and documented
- changes are announced and auditable where appropriate

### Suggested issue bucket
- voting queue
- host-curated mode
- queue lock
- mechanic change flow + guardrails
- queue transition policy handling
- system/audit messaging

### Depends on
- M3 queue + playback stability
- host authority correctness from M1/M5

### Enables
- better host control
- a more differentiated native MVP
- later veto and external policy flows

---

## 7. M5 — Nickname Protection UX

**SDD intent:** Nickname Protection (Participation Gate)  
**SDD effort:** M (2–4 weeks)

### SDD-defined scope
1. Claim nickname (single-step protect-and-join).
2. Authenticate protected nickname.
3. Failed attempt rate limiting.
4. Listener-tier UI with inline upgrade prompts wherever controls are gated.
5. In-place Listener-to-member session upgrade without full rejoin.
6. Protected nickname UI states.
7. Password warning and validation, including no-recovery messaging.

### Important note from the SDD
The core tier model lands in **M1** because later milestones depend on it. M5 is about completing and polishing the protection experience, not inventing the gate from scratch.

### Current status
**Partially implemented; needs hardening and regression coverage**

The repo and planning context suggest that protect/authenticate primitives, in-room upgrade prompts, and in-place Listener→member upgrade already exist or are substantially underway.

### Known gaps blocking sign-off
- same-session reopen / refresh can still undermine the practical user experience
- host authority must remain aligned with the protected-member model
- regression coverage still needs strengthening
- repo docs and canonical project docs should not contradict one another about current implementation

### Exit criteria
- new users can protect-and-join in one clear flow
- returning users can authenticate protected nicknames cleanly
- failed attempts are rate-limited
- Listener upgrade prompts appear where interactive controls are gated
- in-place upgrade works without full room reset
- password requirements and no-recovery warning are explicit
- host authority remains consistent with the protected-member model
- automated tests cover the end-to-end UX paths

### Suggested issue bucket
- protect-and-join UX hardening
- auth retry / failure messaging
- no-recovery warning copy and validation
- host authority alignment with protected-member requirement
- regression tests for Listener→member flows

### Depends on
- M1 session/tier foundation

### Enables
- a coherent native participation story
- lower confusion around gated controls
- launch-ready onboarding

---

## 8. M6 — Moderation and Hardening

**SDD intent:** Moderation and Hardening  
**SDD effort:** M (2–4 weeks)

### SDD-defined scope
1. Ban support.
2. Remove queue item.
3. Delete chat message.
4. Duplicate prevention.
5. Max song duration.
6. Observability.
7. Terms/privacy/compliance review.

### Repo-facing interpretation
This milestone closes the gap between “feature complete enough to demo” and “safe enough to launch.”

### Current status
**Planned**

Some ingredients already exist in the repo, but this milestone should be treated as a native MVP hardening package rather than a set of disconnected chores.

### Exit criteria
- hosts/moderators can remove queue items
- hosts/moderators can delete chat messages
- ban/mute/remove behaviors are consistent and auditable
- duplicate prevention and max duration rules are enforced
- health/readiness/logging/metrics are adequate for native MVP
- dependency degradation behavior is defined and tested
- terms, privacy, and YouTube compliance pages exist
- native regression coverage is sufficient for launch confidence

### Suggested issue bucket
- moderation action APIs and UI
- audit log completion
- duplicate prevention
- max duration enforcement
- observability and structured logging
- degraded-mode behavior
- compliance pages
- native Playwright suite

### Depends on
- M2 and M3 stability
- enough M4 completion for hosts to operate rooms meaningfully

### Enables
- native MVP launch
- a manageable support burden
- a cleaner path to external integrations

---

## 9. M7 — External Embeds and Chat Integrations

**SDD intent:** External Embeds and Chat Integrations  
**SDD effort:** XL (6–10 weeks)

### Repo-facing interpretation
This is the expansion milestone. It extends Trackstacc from a native listening-room product into an embeddable backend for third-party communities.

### Current status
**Planned; second launch**

This milestone is intentionally positioned after native MVP stabilization in the roadmap.

### Core scope
- external integration configuration
- read-only room embed
- signed site-command bridge
- replay protection and idempotency
- external music commands
- outbound signed bot webhooks
- pre-play veto
- staff commands
- timed external mute / early unmute
- external regression harness

### Exit criteria
- embed pages are read-only and do not expose secrets
- inbound external commands are authenticated, authorized, and idempotent
- external user identity is handled server-side only
- public commands are safe and rate-limited
- staff commands are auditable
- webhooks are side effects and do not roll back successful room mutations
- external integrations have dedicated regression coverage

### Suggested issue bucket
- integration CRUD
- embed surface
- signed command auth
- public command slice
- outbound bot webhooks
- veto
- staff command suite
- timed external mute / unmute
- external test harness

### Depends on
- strong M6 native baseline
- explicit decision that M7 is in or out of first-launch scope

### Enables
- second launch / ecosystem expansion
- community-platform use cases
- higher security/abuse-complexity product surface

---

## 10. Native MVP release gate

The recommended first public launch should require **M1 through M6**, with M7 following as a second launch unless strategy explicitly changes.

## Native MVP must have
- stable session and access-tier correctness
- stable presence lifecycle
- member-only chat
- shared queue and authoritative playback
- enough room mechanics for real hosting
- moderation basics
- observability and compliance baseline
- regression coverage good enough to catch launch blockers

## Native MVP should not wait on
- external embeds
- signed external command bridge
- pre-play veto
- external staff commands
- timed external mute

---

## 11. Milestone-to-roadmap mapping

| Roadmap phase | Main milestone(s) advanced | Notes |
| --- | --- | --- |
| Phase 0 — Stabilize native foundation | M1, M5, early M2 | fix current session/tier/presence correctness before pretending the foundation is done |
| Phase 1 — Chat and presence | M2 | social room baseline |
| Phase 2 — Queue and playback | M3 | core product value |
| Phase 3 — Mechanics and native hardening | M4, M6 | launchable native MVP |
| Phase 4 — Native MVP launch readiness | M6 + regression hardening | launch bar and bug sweep |
| Phase 5 — External integrations | M7 | second launch |

---

## 12. Milestone completion checklist

A milestone should be marked complete only when all of the following are true:

- scope is implemented to the level described in this file
- acceptance behavior is verified, not assumed
- tests pass
- typecheck passes
- lint passes
- CI passes
- repo docs reflect reality
- major known regressions for that milestone are closed or explicitly deferred and documented
- the SDD is reviewed if the implementation materially changed design assumptions

This matches the SDD’s expectation that milestone completion should trigger a formal document review.

---

## 13. Immediate sequencing recommendation

If work starts from the current repo state, the best next milestone sequence is:

1. finish **M1 sign-off** via stabilization work
2. finish **M5 sign-off** for the protection UX and member continuity story
3. finish **M2** so the room is socially usable and presence is trustworthy
4. finish **M3** so the core listening-room value is real
5. finish **M4** and **M6** to make the native MVP launchable
6. decide whether **M7** is post-launch or bundled into a later release

That order keeps the project aligned with the strongest product story:
**free listening, protected participation, trustworthy shared playback**
