# Software Design Document: Collaborative YouTube Playlist Rooms

**Project name:** trackstacc.live
**Document type:** Software Design Document (SDD)
**Version:** 1.4.0
**Status:** Draft for design review sign-off; Priority 1, Priority 2, and Priority 3 audit remediations incorporated; mandatory native nickname-protection feature added
**Primary concept:** A no-registration collaborative music-room web application where anyone can open a room on the native `trackstacc.live` site to listen to playback and view the playlist for free, and where, to chat and use full functionality on the native site, a participant must hold a password-protected nickname. Rooms can still be exposed through read-only external embeds controlled by secure external chat command integrations; the mandatory native protection requirement does not apply to those embeds, which continue to use the server-to-server external-identity model.

### Document Metadata

| Field | Value |
| ----- | ----- |
| Author(s) | Project Lead / Engineering |
| Reviewer(s) | Engineering Lead, Product Lead |
| Initial Draft Date | 2026-05-31 |
| Last Review Date | 2026-06-07 |
| Approval Status | Draft — pending design review sign-off |
| Next Scheduled Review | After Milestone 1 completion (see Section 39) |

### Change Log

| Version | Date | Author | Summary |
| ------- | ---- | ------ | ------- |
| 1.0.0 | 2026-05-31 | Project Lead | Initial SDD covering native room experience, queue mechanics, playback, chat, moderation, and nickname protection. |
| 1.1.0 | 2026-06-01 | Project Lead | Added external site embeds, external chat command integrations, pre-play veto voting, staff chat commands, song request policy controls, and additional abuse-prevention requirements. |
| 1.1.1 | 2026-06-02 | Project Lead | Added staff-controlled timed muting of external participants with configurable durations, auto-expiry, and early unmute. |
| 1.1.2 | 2026-06-04 | Project Lead | Priority 1 audit remediation: formal error code registry, CORS/CSP policies for native and embed pages, external dependency circuit breaker and graceful degradation specifications, final backend framework decision (Fastify), and external role coverage in the permission matrix. |
| 1.2.0 | 2026-06-05 | Project Lead | Priority 2 audit remediation: architecture and sequence diagrams, database migration strategy, API conventions (pagination, rate limit headers, versioning), WebSocket reconnection backoff specification, consolidated security cross-references, formal decision log resolving all 18 open questions, effort estimates for implementation milestones, and requirements traceability matrix. |
| 1.3.0 | 2026-06-06 | Project Lead | Priority 3 audit remediation: document metadata and change log, table of contents, Known Limitations and Technical Debt section, Development Operations section (CI/CD, configuration management, environment strategy, dependency management), `external_chat_music` JSONB schema documentation with validation rules and decomposition evaluation, and periodic document review schedule. |
| 1.4.0 | 2026-06-07 | Project Lead | Mandatory native nickname protection: on the native `trackstacc.live` site, a password-protected nickname is now required to chat, vote, add songs, react, or use any other interactive functionality. Visitors without a protected nickname become read-only Listeners who may open rooms to hear playback and view the playlist only. Introduced the Listener role and native access tiers, reworked the native permission matrix, join/create flows, identity service gating, `room_sessions` access-tier modeling, listener chat-visibility room setting, tier-enforcement error codes, and acceptance criteria. The requirement is explicitly scoped to the native site and does not change the read-only external embed or external chat command integration model. |

**Revision note:** Version 1.1 adds external site embeds, external chat command integrations, pre-play veto voting, staff chat commands, song request policy controls, and additional abuse-prevention requirements. Version 1.1.1 adds staff-controlled timed muting of external participants with configurable durations, auto-expiry, and early unmute. Version 1.1.2 resolves Priority 1 audit findings by adding a formal error code registry, CORS/CSP policies for native and embed pages, external dependency circuit breaker and graceful degradation specifications, a final backend framework decision, and external role coverage in the permission matrix. Version 1.2.0 resolves Priority 2 audit findings by adding architecture and sequence diagrams, a database migration strategy, API conventions (pagination, rate limit headers, versioning), WebSocket reconnection backoff specification, consolidated security cross-references, a formal decision log resolving all 18 open questions, effort estimates for implementation milestones, and a requirements traceability matrix. Version 1.3.0 resolves Priority 3 audit findings by adding document metadata and change log, a table of contents, a Known Limitations and Technical Debt section, a Development Operations section covering CI/CD, configuration management, environment strategy, and dependency management, `external_chat_music` JSONB schema documentation with validation rules and decomposition evaluation, and a periodic document review schedule. Version 1.4.0 makes nickname protection mandatory for interactive participation on the native `trackstacc.live` site: a password-protected nickname is now required to chat, vote, add songs, react, or moderate, while visitors without one become read-only Listeners able to hear playback and view the playlist only. This change is scoped exclusively to the native site and does not alter the read-only external embed or external chat command integration authority model.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Product Overview](#3-product-overview)
4. [Definitions](#4-definitions)
5. [Assumptions](#5-assumptions)
6. [Stakeholders](#6-stakeholders)
7. [Functional Requirements](#7-functional-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [User Roles and Permissions](#9-user-roles-and-permissions)
10. [UX Flows](#10-ux-flows)
11. [Playlist Mechanics Design](#11-playlist-mechanics-design)
12. [System Architecture](#12-system-architecture)
13. [Component Design](#13-component-design)
14. [Data Model](#14-data-model)
15. [API Design](#15-api-design)
16. [WebSocket Event Design](#16-websocket-event-design)
17. [Queue Selection Algorithms](#17-queue-selection-algorithms)
18. [Playback Synchronization Design](#18-playback-synchronization-design)
19. [Security Design](#19-security-design)
20. [Abuse Prevention and Moderation Policy](#20-abuse-prevention-and-moderation-policy)
21. [Privacy Design](#21-privacy-design)
22. [YouTube Integration Design](#22-youtube-integration-design)
23. [Error Handling and Resilience](#23-error-handling-and-resilience)
24. [Observability](#24-observability)
25. [Deployment Architecture](#25-deployment-architecture)
26. [Testing Strategy](#26-testing-strategy)
27. [MVP Scope](#27-mvp-scope)
28. [Decision Log](#28-decision-log)
29. [Recommended Product Decisions](#29-recommended-product-decisions)
30. [Implementation Milestones](#30-implementation-milestones)
31. [Acceptance Criteria](#31-acceptance-criteria)
32. [Risks and Mitigations](#32-risks-and-mitigations)
33. [Appendix A: Recommended Default Settings](#33-appendix-a-recommended-default-settings)
34. [Appendix B: Example System Messages](#34-appendix-b-example-system-messages)
35. [Appendix C: Example Room State Snapshot](#35-appendix-c-example-room-state-snapshot)
36. [Final Recommendation](#36-final-recommendation)
37. [Appendix D: Requirements Traceability Matrix](#37-appendix-d-requirements-traceability-matrix)
38. [Known Limitations and Technical Debt](#38-known-limitations-and-technical-debt)
39. [Development Operations](#39-development-operations)
40. [Document Review Schedule](#40-document-review-schedule)

---

## 1. Executive Summary

This web application allows users to create and join real-time music rooms. Each room has a shared YouTube playback experience, a collaborative queue, chat, and configurable playlist mechanics such as first-come-first-served, voting queue, DJ rotation, host-curated mode, and moderated suggestions. Version 1.1 extends this model so external websites can embed a Trackstacc room/player/queue and route music commands from their own chat systems while Trackstacc remains the authoritative music-room backend. Version 1.1.1 adds staff-controlled timed muting of external participants so that song requests from muted users are rejected and voting is blocked, with configurable mute durations (seconds, minutes, hours, days, or permanent) and early unmute support. Version 1.1.2 formalizes the implementation-signoff controls required by the audit: error taxonomy, CORS/CSP, dependency resilience, Fastify backend selection, and complete external-role permissions. Version 1.2.0 adds the design-review-sign-off artifacts required by the Priority 2 audit: architecture and sequence diagrams, database migration strategy, API conventions, WebSocket reconnection specification, consolidated security cross-references, a formal decision log, effort-estimated milestones, and a requirements traceability matrix. Version 1.3.0 adds the living-document maintenance artifacts required by the Priority 3 audit: document metadata with change log, a table of contents, a Known Limitations and Technical Debt section, a Development Operations section covering CI/CD pipelines, configuration management, environment strategy, and dependency management, formal `external_chat_music` JSONB schema documentation with validation rules and a decomposition evaluation, and a periodic document review schedule. Version 1.4.0 introduces mandatory nickname protection for interactive participation on the native `trackstacc.live` site: opening a room to listen and view the playlist remains free and frictionless, but chatting, voting, adding songs, reacting, and all other interactive and moderation functionality now require a password-protected nickname. This version adds the read-only **Listener** role and a two-tier native access model (Listener and authenticated Protected Nickname User), reworks the native permission matrix and join/create flows, and threads tier enforcement through the identity service, data model, API, WebSocket layer, security model, and acceptance criteria. The requirement applies only to the native site; the read-only external embed and external chat command integration authority model is unchanged.

The defining product constraint is **no traditional registration**. Users do not need email, OAuth, or account creation. On the native `trackstacc.live` site, anyone may open a room to listen to what is playing and view the playlist without entering any identity at all. To participate interactively — chat, vote, add songs, react, or moderate — a user must hold a **password-protected nickname**. This preserves the no-registration model (a protected nickname is a nickname plus a password, never an email or account) while ensuring every interactive actor has a lightweight, impersonation-resistant, continuous identity. The system never assigns generic anonymous names such as `guest_1234`. This mandatory-protection requirement applies only to the native site; external embeds remain read-only and are driven by the separate server-to-server external chat command integration model (Sections 3.2.2, 12.4, and 19.5).

The room creator, called the **host**, can configure room behavior, including the playlist mechanic. The host may change the playlist mechanic later, subject to transparent guardrails: the current song is not interrupted, existing queue items are preserved by default, changes are announced in chat, and potentially disruptive changes require confirmation.

External site integrations preserve the same authority model. The embedding website owns its chat UI and local user identity, but Trackstacc verifies every command, applies room policy, mutates queue/playback/settings only after validation, emits realtime updates, and optionally posts bot-style announcements back into the embedding site's chat.

---

## 2. Goals and Non-Goals

### 2.1 Goals

1. Provide instant music-room creation with minimal onboarding.
2. Let anyone open a native room to listen to playback and view the playlist with zero onboarding (no nickname, no password).
3. Require a password-protected nickname on the native site before a user can chat, vote, react, add tracks, or use any other interactive functionality.
4. Support password-protected nicknames without email or registration, as the gateway to native participation.
5. Enable collaborative YouTube-based music playback.
6. Provide real-time synchronized room state, queue updates, voting, chat, and moderation events.
7. Support multiple playlist mechanics suitable for different social contexts.
8. Allow the room creator to configure and later change playlist mechanics safely.
9. Provide basic moderation tools suitable for no-registration public and private rooms.
10. Design for MVP delivery while leaving room for future public discovery, profiles, persistent rooms, and richer moderation.
11. Allow webmasters to embed a Trackstacc room/player/queue into their own websites.
12. Allow external chat rooms to submit Trackstacc music commands through a secure server-to-server bridge.
13. Preserve Trackstacc's server-side authority for all room mutations, playback decisions, moderation decisions, rate limits, and audit logs.
14. Support pre-play veto voting through external chat commands.
15. Support staff chat commands for queue moderation, force skip, and room setting changes.
16. Provide configurable song request policies for public or semi-public communities.
17. Prevent abuse through signing, idempotency, rate limits, duplicate controls, queue limits, and audit logs.
18. Allow staff to mute external participants with configurable durations (seconds, minutes, hours, days, or permanent) to block song requests and votes from abusive users, with early unmute support.

### 2.2 Non-Goals for MVP

1. No native audio hosting, downloading, transcoding, or re-streaming of music.
2. No full user account system with email verification or OAuth.
3. No direct YouTube account integration for end users in MVP.
4. No monetization, subscriptions, advertisements, or tipping in MVP.
5. No native mobile apps in MVP.
6. No global friend graph or private messaging in MVP.
7. No guaranteed sample-accurate synchronized playback across clients.
8. No full trust-and-safety admin console beyond basic moderation tools.
9. Trackstacc does not become a generic chat hosting platform for third-party sites.
10. The embed does not trust browser-provided identity for voting or queue mutations.
11. The embed does not expose privileged write controls by default.
12. Trackstacc does not scrape, proxy, download, cache, or re-stream YouTube audiovisual content.
13. Trackstacc does not guarantee that external websites provide accurate identity, but it requires stable external user IDs for fair voting, rate limiting, moderation, and audit.
14. Trackstacc does not moderate all content in the embedding site's chat; it only enforces Trackstacc room policy for music commands it receives.
15. The mandatory native protected-nickname requirement does not apply to external embeds or external chat command integrations; those continue to operate under the read-only embed and server-to-server external-identity model and are not required to authenticate native protected nicknames.

---

## 3. Product Overview

### 3.1 Core User Story

A user creates a room, selects a playlist mechanic, shares the room link, and friends join by entering their chosen nicknames. Users chat, add YouTube songs, vote or take DJ turns depending on the room mechanic, and listen together.

### 3.2 High-Level Experience

Trackstacc supports two room usage modes:

1. **Native Trackstacc room experience.** Users visit Trackstacc directly and can listen to any room and view its playlist for free. To chat, vote, queue songs, or moderate, they claim or authenticate a password-protected nickname and then use Trackstacc controls according to room permissions.
2. **Embedded external-site experience.** A webmaster creates or configures a Trackstacc room, registers the embedding site origin, chat channel, outbound webhook, command prefix, and command permissions, then receives an iframe embed URL and a server-side integration secret. Users listen through the embed but control music through the embedding site's chat commands. Trackstacc processes those commands and posts bot announcements back into the embedding site's chat.

#### 3.2.1 Native Trackstacc Room Experience

The native site supports two access tiers within a room (see Section 9 for the full role and permission model):

1. Visitor opens a room URL.
2. The room loads immediately in **Listener** mode: the visitor can hear current playback and view the playlist/queue and room metadata without entering any identity. No nickname or password is required to listen.
3. To do anything interactive — chat, vote, add a song, react, skip-vote, or moderate — the visitor must obtain a **protected nickname** by either:
   - authenticating an existing protected nickname with its password, or
   - claiming a new nickname and setting a password (a one-step protect-and-join).
4. Once authenticated against a protected nickname, the participant becomes a **Protected Nickname User** with full functionality according to room permissions.
5. A Listener may upgrade to a Protected Nickname User at any time from within the room; the upgrade prompt is surfaced wherever an interactive control would otherwise appear.
6. The room creator must hold a protected nickname to exercise host authority; host and moderators can manage queue, chat, room settings, and playlist mechanic only as Protected Nickname Users.
7. The system never assigns generic anonymous names; a Listener has no nickname at all until they protect one.

#### 3.2.2 Embedded External-Site Experience

1. A webmaster creates or configures a Trackstacc room.
2. The webmaster registers their site origin, chat channel ID, outbound bot webhook, command prefix, enabled commands, trusted role mappings, and staff command permissions.
3. Trackstacc provides a read-only iframe embed URL and an integration secret for the webmaster's backend.
4. The embedding website renders the Trackstacc room/player/queue embed in its own page.
5. Users listen through the embed.
6. Users type commands such as `!sr <youtube-url>`, `!song`, `!queue`, `!yay`, and `!nay` in the embedding site's chat.
7. The embedding site's backend forwards relevant music commands to Trackstacc through a signed server-to-server command bridge.
8. Trackstacc validates the integration, actor, policy, rate limits, duplicate rules, veto state, and staff authorization before mutating any room state.
9. Trackstacc emits realtime room events to connected Trackstacc clients and embeds.
10. Trackstacc optionally posts a signed outbound bot webhook result back to the embedding site, and the embedding site posts the bot message into its own chat.

### 3.3 Core Differentiator

The product offers **listening without onboarding, and identity without registration**:

> Open any room and listen for free. To join in — chat, vote, and queue songs — claim a nickname and protect it with a password. No email, ever.

Listening is instant and frictionless. Interactive participation requires a protected nickname, which gives every active contributor a lightweight, impersonation-resistant, continuous identity without the friction of full account registration.

---

## 4. Definitions

| Term                 | Definition                                                                            |
| -------------------- | ------------------------------------------------------------------------------------- |
| Visitor              | A person who has opened the app or a room but has not authenticated a protected nickname. On the native site a visitor inside a room is a Listener. |
| Listener             | A native-site user inside a room without a protected-nickname session. Read-only: may hear playback and view the playlist/queue but cannot chat, vote, add songs, react, or moderate. |
| Participant          | A person actively participating in a native room with an authenticated protected nickname. On the native site, interactive participation requires a protected nickname (see Native Access Tier). |
| Native Access Tier   | The native-site access level of a user in a room: `listener` (read-only listen and view) or `member` (full interactive functionality, granted only with an authenticated protected nickname). |
| Full Functionality   | The set of native interactive capabilities (chat, vote, react, add songs, skip-vote, host/moderator actions) available only to `member`-tier users holding a protected nickname. |
| Host                 | The room creator or holder of the room host secret. On the native site the host must authenticate a protected nickname to exercise host authority. |
| Moderator            | A participant with moderation permissions granted by the host. Must be a Protected Nickname User on the native site. |
| Protected nickname   | A nickname reserved by password hash. On the native site, holding and authenticating one is the prerequisite for full functionality. |
| Unprotected nickname | A nickname not yet claimed by password. On the native site an unprotected nickname does not by itself grant interactive functionality (the user remains a Listener until a nickname is protected). |
| Room                 | A shared real-time space with chat, playback, queue, and settings.                    |
| Queue item           | A pending or historical track entry added to a room queue.                            |
| Playlist mechanic    | The algorithm/rule set that determines how songs enter and advance through the queue. |
| DJ rotation          | A playlist mechanic where active eligible users take turns adding songs.              |
| Voting queue         | A playlist mechanic where queued songs are prioritized by votes.                      |
| FIFO                 | First-in-first-out queue mechanic.                                                    |
| Suggestion mode      | A mechanic where users submit songs that require host/mod approval.                   |
| Session              | Browser/device-level authenticated room participation token.                          |
| Presence             | Real-time online/offline state of users in a room.                                    |
| External Site Integration | A configured server-to-server relationship that lets an external website submit music commands for a Trackstacc room. |
| Embedding Site | The third-party website that embeds a Trackstacc room/player/queue and owns its own chat UI and user identity. |
| External Chat Command | A chat message entered on an embedding site, such as `!sr` or `!nay`, that the embedding site's backend forwards to Trackstacc. |
| External Participant | A Trackstacc identity mapping for a user known by an embedding site, used for voting, rate limiting, moderation, and audit. |
| External User ID | A stable, embedding-site-provided user identifier. It must come from the embedding site's backend, not browser input. |
| Site Integration Secret | Server-side credential used to authenticate inbound commands or sign outbound webhooks for an external site integration. |
| Outbound Bot Webhook | A webhook endpoint configured by the embedding site where Trackstacc can send signed bot-style command responses and announcements. |
| Embeddable Room | A Trackstacc room view intended for iframe embedding on a registered external site. |
| Read-Only Embed | Default embed mode that displays playback, queue, veto status, command hints, and policy state without accepting mutations. |
| Pre-Play Veto | A short voting gate before a selected candidate starts playback, allowing eligible users to keep or veto the candidate. |
| Veto Candidate | The queue item selected as next up while a pre-play veto window is open. |
| Net Nays | The veto score calculated as `nayCount - yayCount`. |
| Staff Command | An external chat command available only to authorized host/staff users, such as `!rm`, `!skip`, or `!music lock`. |
| Song Request Policy | Room or integration setting that controls who may submit songs and how often. |
| External Reference | A short room/integration/channel-scoped reference such as `[K7Q]` used to identify queue items or current candidates in chat commands and bot messages. |
| Active Voter / Eligible Voter | An external or native participant allowed to vote in the current pre-play veto window according to room policy, moderation status, and rate limits. |
| External Mute | A staff-applied restriction on an external participant that prevents their song requests and votes from being accepted. Can be temporary (with a configurable duration in seconds, minutes, hours, or days) or permanent (until manually unmuted). |
| Mute Duration | A time-limited mute period expressed as `<number><unit>` where unit is `s` (seconds), `m` (minutes), `h` (hours), or `d` (days). Omitting a unit or specifying `forever` applies a permanent mute. |
| Early Unmute | The ability for staff to lift a mute before its configured duration expires, restoring the external participant's ability to submit song requests and cast votes. |

---

## 5. Assumptions

1. YouTube content is played through official embedded player functionality, not downloaded, proxied, or re-hosted.
2. Some YouTube videos may be unavailable for embedding, age-restricted, region-restricted, removed, private, or otherwise unplayable.
3. Browser autoplay restrictions may require a user gesture before playback begins on some clients, especially mobile browsers.
4. Exact playback synchronization cannot be guaranteed across devices; acceptable sync tolerance for MVP is approximately 1-3 seconds.
5. The application stores only minimal identity data: nickname, normalized nickname, password hash if protected, session identifiers, and room participation metadata.
6. Password-protected nicknames have no recovery path in MVP because there is no email or account system.
7. Public rooms require stronger moderation and rate limiting than private link-only rooms.
8. The host is not necessarily a registered account; host authority is established by a secure room host secret or by a protected nickname binding.
9. External websites own their own chat UI and user identity; Trackstacc treats that identity as an integration input and still enforces Trackstacc room policy.
10. External site integrations require stable external user IDs for fair voting, rate limiting, moderation, and audit.
11. External embeds are read-only by default and must not store integration secrets or trust browser-provided role/session/user identity.
12. Native in-app slash commands may remain Phase 2; external chat command integration is introduced in v1.1 as a server-to-server integration capability.
13. On the native site, listening to playback and viewing the playlist require no identity; interactive participation requires an authenticated protected nickname. This raises the per-participant cost of abuse but is assumed acceptable given that listening remains frictionless.
14. The mandatory native protected-nickname requirement is enforced server-side on every interactive action and does not rely on client-side gating.
15. The mandatory native protected-nickname requirement does not apply to external embeds or external chat command integrations, which retain the read-only embed and server-to-server external-identity model.

---

## 6. Stakeholders

| Stakeholder      | Interest                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- |
| Casual users     | Join rooms quickly, chat, listen, and add songs with minimal friction.                |
| Room hosts       | Configure room behavior, moderate activity, and keep the room organized.              |
| Moderators       | Help manage queue spam, chat abuse, and disruptive users.                             |
| Engineering      | Build a scalable, maintainable real-time web app.                                     |
| Product/design   | Preserve low-friction UX while providing enough control for healthy rooms.            |
| Legal/compliance | Ensure YouTube integration and privacy practices follow applicable platform policies. |
| Operations       | Monitor abuse, downtime, rate limits, and cost.                                       |

---

## 7. Functional Requirements

### 7.1 Room Creation

| ID     | Requirement                                                                                       | Priority    |
| ------ | ------------------------------------------------------------------------------------------------- | ----------- |
| FR-001 | Users can create a room without registration.                                                     | MVP         |
| FR-002 | Room creator must choose or accept a default playlist mechanic.                                   | MVP         |
| FR-003 | Room creator receives host authority via secure host session and/or host link.                    | MVP         |
| FR-004 | Room creator can optionally set room name, description, tags, room visibility, and room password. | MVP/Phase 2 |
| FR-005 | Room creator can configure whether the room is temporary or persistent.                           | Phase 2     |
| FR-006 | Room creator can configure queue limits, song duration limits, and duplicate rules.               | MVP         |

### 7.2 Room Joining, Listening, and Nicknames

| ID     | Requirement                                                                                      | Priority |
| ------ | ------------------------------------------------------------------------------------------------ | -------- |
| FR-010 | On the native site, a user must hold an authenticated protected nickname before chatting, voting, reacting, adding songs, or using any other interactive functionality. | MVP |
| FR-011 | The system must not auto-generate `guest_1234`-style names for participants.                     | MVP      |
| FR-012 | Nicknames are normalized for uniqueness checks.                                                  | MVP      |
| FR-013 | Nickname display casing is preserved after normalization.                                        | MVP      |
| FR-014 | To use a protected nickname, the user must provide its correct password.                          | MVP      |
| FR-015 | A user may obtain full functionality by claiming a new nickname and setting a password in a single protect-and-join step. | MVP |
| FR-016 | A user with an authenticated protected nickname may use it across rooms without re-claiming it.   | MVP      |
| FR-017 | Users may change to another protected nickname, subject to authentication and rate limits.        | MVP      |
| FR-018 | Offensive, reserved, or confusing nicknames may be blocked by policy.                            | MVP      |
| FR-019 | On the native site, any user may open a room and remain a read-only **Listener** — hearing playback and viewing the playlist/queue — without entering a nickname or password. | MVP |

This section applies to the native `trackstacc.live` site. External embeds and external chat command integrations are governed by Sections 7.11–7.14 and are not subject to the native protected-nickname requirement.

### 7.3 Nickname Protection

| ID     | Requirement                                                                           | Priority |
| ------ | ------------------------------------------------------------------------------------- | -------- |
| FR-020 | Users can claim/protect an unprotected nickname by setting a password.                | MVP      |
| FR-021 | Nickname passwords are stored only as salted password hashes.                         | MVP      |
| FR-022 | A protected nickname can be used across rooms after password validation.              | MVP      |
| FR-023 | Failed nickname password attempts are rate-limited.                                   | MVP      |
| FR-024 | Password reset is not supported in MVP.                                               | MVP      |
| FR-025 | The UI must clearly warn users that forgotten nickname passwords cannot be recovered. | MVP      |
| FR-026 | Protected nickname owners may change their nickname password after re-authentication. | Phase 2  |
| FR-027 | Protected nickname owners may release/delete their nickname claim.                    | Phase 2  |
| FR-028 | On the native site, the server must reject every interactive action (chat, vote, react, add song, skip-vote, moderation, settings change) from a session that is not bound to an authenticated protected nickname, returning a clear "protection required" error. | MVP |
| FR-029 | The native UI must present a clear, low-friction prompt to claim or authenticate a protected nickname wherever an interactive control would appear for a Listener, explaining that protection unlocks participation. | MVP |

### 7.4 YouTube Track Input

| ID     | Requirement                                                                                   | Priority |
| ------ | --------------------------------------------------------------------------------------------- | -------- |
| FR-030 | Users can add songs by pasting a YouTube video URL.                                           | MVP      |
| FR-031 | The app extracts and validates YouTube video IDs from supported URL formats.                  | MVP      |
| FR-032 | The app fetches metadata such as title, channel, thumbnail, and duration when available.      | MVP      |
| FR-033 | The app rejects videos that exceed configured max duration unless host/mod approves.          | MVP      |
| FR-034 | The app rejects duplicate queue items according to room duplicate policy.                     | MVP      |
| FR-035 | Users can search YouTube from inside the app.                                                 | Phase 2  |
| FR-036 | Users can import YouTube playlist URLs.                                                       | Phase 2  |
| FR-037 | Unavailable, private, deleted, age-restricted, or unembeddable videos are handled gracefully. | MVP      |

### 7.5 Playback

| ID     | Requirement                                                                                               | Priority |
| ------ | --------------------------------------------------------------------------------------------------------- | -------- |
| FR-040 | Each room has one authoritative current track state.                                                      | MVP      |
| FR-041 | Clients receive current track, playback status, and approximate playback position.                        | MVP      |
| FR-042 | Host/moderators can skip the current track.                                                               | MVP      |
| FR-043 | Participants can vote to skip if the room allows skip voting.                                             | MVP      |
| FR-044 | When a track ends, the server advances to the next eligible queue item.                                   | MVP      |
| FR-045 | Clients resynchronize periodically or upon state change.                                                  | MVP      |
| FR-046 | If the embedded player fails, the client reports playback failure and the server may skip or mark failed. | MVP      |

### 7.6 Playlist Mechanics

| ID     | Requirement                                                                                    | Priority    |
| ------ | ---------------------------------------------------------------------------------------------- | ----------- |
| FR-050 | Rooms support FIFO queue mode.                                                                 | MVP         |
| FR-051 | Rooms support voting queue mode.                                                               | MVP         |
| FR-052 | Rooms support DJ rotation mode.                                                                | MVP/Phase 2 |
| FR-053 | Rooms support host-curated mode.                                                               | MVP         |
| FR-054 | Rooms support moderated suggestion mode.                                                       | Phase 2     |
| FR-055 | Host can change playlist mechanic after room creation.                                         | MVP         |
| FR-056 | Playlist mechanic changes do not automatically interrupt the current song.                     | MVP         |
| FR-057 | Playlist mechanic changes are announced as system chat events.                                 | MVP         |
| FR-058 | Existing queue order is preserved by default when changing mechanics.                          | MVP         |
| FR-059 | Host may optionally recalculate or clear the queue when changing mechanics, with confirmation. | Phase 2     |
| FR-060 | Public rooms may enforce a cooldown between mechanic changes.                                  | MVP/Phase 2 |

### 7.7 Chat

| ID     | Requirement                                                                                                        | Priority |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-070 | Participants can send and receive real-time chat messages.                                                         | MVP      |
| FR-071 | Native Listeners (users without an authenticated protected nickname) cannot send chat messages.                    | MVP      |
| FR-072 | Chat messages include nickname, timestamp, and room context.                                                       | MVP      |
| FR-073 | Chat messages are rate-limited.                                                                                    | MVP      |
| FR-074 | System messages announce joins, nickname changes, song additions, skips, moderation actions, and mechanic changes. | MVP      |
| FR-075 | Hosts/moderators can delete chat messages.                                                                         | MVP      |
| FR-076 | Hosts/moderators can mute participants.                                                                            | MVP      |
| FR-077 | Optional emoji reactions, mentions, and slash commands are supported.                                              | Phase 2  |
| FR-078 | Whether native Listeners can read (but not send) chat is controlled by a per-room `listener_chat_visible` setting, defaulting to hidden so a Listener's surface is limited to playback and the playlist. | MVP |

### 7.8 Moderation

| ID     | Requirement                                                                                                                | Priority |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-080 | Host can mute participants.                                                                                                | MVP      |
| FR-081 | Host can ban participants from a room using session/device/IP-derived moderation identifiers where lawful and appropriate. | MVP      |
| FR-082 | Host can remove queue items.                                                                                               | MVP      |
| FR-083 | Host can skip current track.                                                                                               | MVP      |
| FR-084 | Host can assign or revoke moderator role.                                                                                  | Phase 2  |
| FR-085 | Moderation actions are logged as audit events.                                                                             | MVP      |
| FR-086 | Room-level slow mode can be enabled.                                                                                       | Phase 2  |
| FR-087 | Host can lock queue additions.                                                                                             | MVP      |
| FR-088 | Host can lock chat.                                                                                                        | Phase 2  |

### 7.9 Presence

| ID     | Requirement                                                           | Priority    |
| ------ | --------------------------------------------------------------------- | ----------- |
| FR-090 | The app shows active participants in a room.                          | MVP         |
| FR-091 | Presence updates when users connect, disconnect, or go idle.          | MVP         |
| FR-092 | DJ rotation eligibility depends on presence and participation status. | MVP/Phase 2 |

**Presence Identity and Lifecycle Design:**
- **Identity Model:** Presence is tracked by a stable room session identity (`room_sessions.id`), rather than by transient socket ID or display name. This ensures that multiple tabs or sockets opened by the same user in the same room reconcile to a single active participant entry in the UI.
- **Heartbeat & Timeout:** Connected clients emit a `presence.heartbeat` event every 25 seconds. The server sweeps inactive sessions whose last heartbeat or activity exceeds 60 seconds.
- **Reconnection Convergence:** When a client reconnects, the server returns a complete `room.snapshot` containing the authoritative participant list. Active participants are also updated via `presence.updated` events. Clients overwrite local participant lists with these server-authoritative payloads to guarantee convergence.
- **Degraded Fallback:** Presence uses Redis ZSETs for acceleration and distributed coordination. If Redis is degraded, presence falls back to PostgreSQL, querying `room_sessions` directly using the `lastSeenAt` and `leftAt` columns to determine active users. Stale sessions are cleaned up using DB fallback updates.

### 7.10 Room Settings

| ID     | Requirement                                | Priority |
| ------ | ------------------------------------------ | -------- |
| FR-100 | Host can update room name and description. | MVP      |
| FR-101 | Host can set max song duration.            | MVP      |
| FR-102 | Host can configure duplicate-song policy.  | MVP      |
| FR-103 | Host can configure who can add songs.      | MVP      |
| FR-104 | Host can configure skip voting threshold.  | MVP      |
| FR-105 | Host can toggle public/private visibility. | Phase 2  |
| FR-106 | Host can set or rotate room password.      | Phase 2  |

### 7.11 External Site Embeds and Chat Integrations

| ID     | Requirement                                                                                                              | Priority    |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | ----------- |
| FR-110 | Hosts can create an external site integration for a room.                                                                | MVP/Phase 2 |
| FR-111 | An integration can define allowed site origins, channel ID, command prefix, outbound webhook URL, and enabled commands.  | MVP/Phase 2 |
| FR-112 | Trackstacc provides a read-only embeddable room/player/queue view.                                                       | MVP/Phase 2 |
| FR-113 | The read-only embed can display current track, queue, pre-play veto status, and command hints.                           | MVP/Phase 2 |
| FR-114 | The read-only embed must not accept votes, song requests, or staff actions without authenticated server-side identity.    | MVP         |
| FR-115 | External chat commands are submitted through a server-to-server endpoint.                                                 | MVP/Phase 2 |
| FR-116 | Trackstacc verifies inbound integration authentication before processing commands.                                        | MVP         |
| FR-117 | Trackstacc maps external users to external participant records for voting, rate limiting, moderation, and audit.          | MVP/Phase 2 |
| FR-118 | Trackstacc can post signed outbound bot messages to the embedding site.                                                   | MVP/Phase 2 |
| FR-119 | External command results include clear user-facing success/failure messages.                                             | MVP/Phase 2 |

### 7.12 Pre-Play Veto

| ID     | Requirement                                                                                         | Priority    |
| ------ | --------------------------------------------------------------------------------------------------- | ----------- |
| FR-130 | Rooms can enable pre-play veto for upcoming songs.                                                  | MVP/Phase 2 |
| FR-131 | Pre-play veto opens only before playback starts for a selected candidate.                           | MVP/Phase 2 |
| FR-132 | Pre-play veto opens only when at least one alternate queued candidate exists.                       | MVP/Phase 2 |
| FR-133 | If no alternate candidate exists, voting is not opened and the song plays normally.                 | MVP/Phase 2 |
| FR-134 | `!yay` votes to keep the candidate.                                                                | MVP/Phase 2 |
| FR-135 | `!nay` votes to veto the candidate.                                                                | MVP/Phase 2 |
| FR-136 | Each eligible user has one active vote per candidate.                                              | MVP/Phase 2 |
| FR-137 | Users can change their vote during the window.                                                     | MVP/Phase 2 |
| FR-138 | Net nays are calculated as `nayCount - yayCount`.                                                  | MVP/Phase 2 |
| FR-139 | The candidate is vetoed if net nays reach the configured threshold.                                | MVP/Phase 2 |
| FR-140 | Supported threshold modes are fixed, percentage, and hybrid.                                       | MVP/Phase 2 |
| FR-141 | Veto results are announced as system/bot messages.                                                 | MVP/Phase 2 |
| FR-142 | Vetoed items are marked distinctly from played, skipped, removed, and failed items.                 | MVP/Phase 2 |
| FR-143 | If the window closes without veto, the candidate starts playback.                                  | MVP/Phase 2 |

### 7.13 External Staff Commands and Song Request Policy

| ID     | Requirement                                                                                                 | Priority    |
| ------ | ----------------------------------------------------------------------------------------------------------- | ----------- |
| FR-150 | External integrations can define staff users and/or trusted external roles.                                  | MVP/Phase 2 |
| FR-151 | Staff commands are authorized server-side.                                                                  | MVP         |
| FR-152 | Staff can remove queued items by reference.                                                                 | MVP/Phase 2 |
| FR-153 | Staff can remove queued items by YouTube URL.                                                               | MVP/Phase 2 |
| FR-154 | Staff can force skip the current song.                                                                      | MVP/Phase 2 |
| FR-155 | Staff can change room music settings through chat commands when permitted.                                  | MVP/Phase 2 |
| FR-156 | Staff actions are audit logged and announced.                                                               | MVP         |
| FR-157 | Rooms support song request policy modes: open, per-user cooldown, after-user-song-finishes, staff-only, and closed. | MVP/Phase 2 |
| FR-158 | Per-user cooldown is enforced by external user ID.                                                          | MVP/Phase 2 |
| FR-159 | After-user-song-finishes mode prevents a user from stacking accepted songs.                                  | MVP/Phase 2 |
| FR-160 | Staff-only mode restricts song additions to authorized staff.                                               | MVP/Phase 2 |
| FR-161 | Closed mode rejects all song additions until reopened.                                                      | MVP/Phase 2 |
| FR-162 | Room settings changed via external staff commands persist and broadcast.                                    | MVP/Phase 2 |
| FR-163 | Staff can mute an external participant to block their song requests and votes.                                | MVP/Phase 2 |
| FR-164 | Staff can specify a mute duration in seconds (`Ns`), minutes (`Nm`), hours (`Nh`), days (`Nd`), or permanent (omit unit or `forever`). | MVP/Phase 2 |
| FR-165 | A timed mute auto-expires after its configured duration, restoring the participant's ability to request songs and vote. | MVP/Phase 2 |
| FR-166 | Staff can unmute an external participant before the mute duration expires (early unmute).                     | MVP/Phase 2 |
| FR-167 | Mute/unmute actions are audit logged and announced as bot/system messages.                                    | MVP         |
| FR-168 | Muted external participants can still use read-only commands (`!song`, `!queue`) but are rejected from `!sr`, `!yay`, and `!nay`. | MVP/Phase 2 |

### 7.14 External Abuse Prevention and Integration Security

| ID     | Requirement                                                                                                       | Priority    |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-170 | Inbound command requests require authentication and replay protection.                                             | MVP         |
| FR-171 | Duplicate external messages are idempotently handled.                                                            | MVP         |
| FR-172 | Integration, room, user, and command-level rate limits are enforced.                                              | MVP/Phase 2 |
| FR-173 | Song requests enforce queue size, pending-per-user, duration, duplicate, and blocked-content policies.            | MVP/Phase 2 |
| FR-174 | Voting enforces one vote per eligible external user per candidate.                                                | MVP/Phase 2 |
| FR-175 | External user display names and command text are sanitized.                                                       | MVP         |
| FR-176 | Outbound webhooks are signed.                                                                                    | MVP/Phase 2 |
| FR-177 | Privileged external commands are audit logged.                                                                    | MVP         |
| FR-178 | Embed origins are restricted to configured/allowed domains.                                                       | MVP/Phase 2 |
| FR-179 | Server-side integration secrets are never exposed to browser embeds.                                              | MVP         |

---

## 8. Non-Functional Requirements

### 8.1 Performance

| ID      | Requirement                                                  | Target                             |
| ------- | ------------------------------------------------------------ | ---------------------------------- |
| NFR-001 | Chat messages should appear for connected users quickly.     | p95 under 500ms within same region |
| NFR-002 | Queue updates should propagate quickly.                      | p95 under 500ms                    |
| NFR-003 | Room join should complete quickly after nickname validation. | p95 under 1.5s                     |
| NFR-004 | Playback sync drift should be limited where possible.        | typical 1-3s tolerance             |
| NFR-005 | App shell should load quickly on broadband.                  | LCP under 2.5s target              |

### 8.2 Scalability

| ID      | Requirement                                             | Target                                 |
| ------- | ------------------------------------------------------- | -------------------------------------- |
| NFR-010 | Support small rooms.                                    | 2-50 users                             |
| NFR-011 | Support medium public rooms.                            | 50-500 users with horizontal scaling   |
| NFR-012 | Support many concurrent rooms.                          | architecture must shard room events    |
| NFR-013 | Real-time infrastructure must be horizontally scalable. | stateless gateways + Redis/pubsub/NATS |

### 8.3 Availability

| ID      | Requirement                                           | Target                                                          |
| ------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| NFR-020 | Core app uptime.                                      | 99.5% MVP target                                                |
| NFR-021 | Graceful degradation when YouTube metadata API fails. | URL adds may still use extracted video ID with partial metadata |
| NFR-022 | Reconnect support for dropped WebSocket connections.  | automatic reconnect with room state refresh                     |
| NFR-023 | External dependency failures must degrade safely.      | circuit breakers, timeouts, and documented fallback behavior for YouTube, Redis, PostgreSQL, and webhooks |

### 8.4 Security

| ID      | Requirement                                                           | Target                                |
| ------- | --------------------------------------------------------------------- | ------------------------------------- |
| NFR-030 | Nickname passwords must be securely hashed.                           | Argon2id preferred; bcrypt acceptable |
| NFR-031 | Session tokens must be signed, random, and httpOnly where applicable. | required                              |
| NFR-032 | Host secrets must be high-entropy and non-guessable.                  | required                              |
| NFR-033 | All writes must be authorized server-side.                            | required                              |
| NFR-034 | Chat and room input must be sanitized.                                | required                              |
| NFR-035 | API and real-time events must be rate-limited.                        | required                              |
| NFR-036 | REST, WebSocket, and external command failures must use a formal error code registry. | required |
| NFR-037 | Native pages, embed pages, REST APIs, and Socket.IO must enforce documented CORS and CSP policies. | required |
| NFR-038 | On the native site, the protected-nickname gate for interactive actions must be enforced server-side on every request and WebSocket event, independent of client-side UI state. | required |

### 8.5 Privacy

| ID      | Requirement                                                                              | Target   |
| ------- | ---------------------------------------------------------------------------------------- | -------- |
| NFR-040 | Collect minimum data necessary for room operation and abuse prevention.                  | required |
| NFR-041 | Publicly visible data should not expose IP addresses, session IDs, or password metadata. | required |
| NFR-042 | Privacy policy must disclose use of YouTube API/embedded services and stored user data.  | required |
| NFR-043 | Logs should avoid storing plaintext secrets or passwords.                                | required |

### 8.6 Compliance

| ID      | Requirement                                                                                                | Target   |
| ------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| NFR-050 | YouTube playback must use permitted embed/API behavior.                                                    | required |
| NFR-051 | The app must not download, cache, extract, or re-stream YouTube audiovisual content.                       | required |
| NFR-052 | The app must include required YouTube/Google terms, privacy, and attribution disclosures where applicable. | required |
| NFR-053 | YouTube API quota usage must be monitored and controlled.                                                  | required |

### 8.7 External Integration Non-Functional Requirements

| ID      | Requirement                                                                                                             | Target                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| NFR-060 | External command processing should return user-facing command results quickly.                                           | p95 under 1s within same region       |
| NFR-061 | Outbound bot webhook failure must not roll back successful queue, playback, vote, or settings changes.                  | required                              |
| NFR-062 | Outbound bot webhooks should use bounded retries with backoff and duplicate-safe delivery identifiers.                  | required                              |
| NFR-063 | Integration, room, user, command, staff-command, and webhook rate limits must be observable and configurable.           | required                              |
| NFR-064 | Embed pages must use origin allowlists and CSP/frame-ancestors guidance for registered embed origins.                   | required                              |
| NFR-065 | External user IDs must be treated as pseudonymous identifiers and stored only as needed for voting, moderation, audit, and rate limiting. | required |
| NFR-066 | Public payloads must not expose integration secrets, raw IP addresses, session IDs, room password metadata, or host secret metadata. | required |
| NFR-067 | Staff command actions must be auditable by room, integration, actor, command, result, and timestamp.                    | required                              |
| NFR-068 | Observability must cover command volume, rejected commands, veto results, webhook failures, abuse limits, and policy changes. | required                         |
| NFR-069 | Terms/privacy disclosures should explain external site integrations and YouTube embed/API usage.                       | required                              |

---

## 9. User Roles and Permissions

### 9.1 Roles

| Role                    | Description                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Visitor                 | Has opened the app or a room but has not authenticated a protected nickname. Inside a native room, a visitor is a Listener. |
| Listener                | Native-site user in a room without a protected-nickname session. Read-only: hears playback and views the playlist/queue. Cannot chat, vote, add songs, react, or moderate. |
| Participant             | Native-site user actively participating. On the native site this requires `member` tier, i.e. an authenticated protected nickname. |
| Protected Nickname User | Participant authenticated against a protected nickname. This is the `member` access tier and the prerequisite for all native interactive functionality, including host and moderator roles. |
| Host                    | Controls room settings, moderation, queue, and playlist mechanic. Must hold an authenticated protected nickname to exercise host authority on the native site. |
| Moderator               | Delegated moderation role. Must be a Protected Nickname User. Optional in MVP, stronger in Phase 2.                       |
| System                  | Server-generated events and automated actions.                                         |
| External Participant    | User represented by an embedding site's stable external user ID.                       |
| External Staff          | External participant authorized for staff commands through allowlist or trusted role mapping. |
| Integration Bot         | System actor that posts Trackstacc command results into the embedding site's chat.     |

### 9.2 Permission Matrix

#### 9.2.1 Native Trackstacc Permission Matrix

On the native site, every interactive capability requires the `member` access tier (an authenticated protected nickname). A **Listener** is any in-room user without a protected-nickname session; Listeners are strictly read-only. Host and Moderator authority is exercised only by Protected Nickname Users; a host who has not yet authenticated a protected nickname is treated as a Listener of their own room until they do.

| Action                        | Listener | Protected Nickname User | Moderator | Host |
| ----------------------------- | -------: | ----------------------: | --------: | ---: |
| Open room / hear playback     | Yes      | Yes                     | Yes       | Yes  |
| View playlist / queue         | Yes      | Yes                     | Yes       | Yes  |
| Read chat                     | Configurable (`listener_chat_visible`, default No) | Yes | Yes | Yes |
| Claim/authenticate protected nickname (upgrade) | Yes | N/A           | N/A       | N/A  |
| Chat                          | No       | Yes                     | Yes       | Yes  |
| Add song                      | No       | Configurable            | Yes       | Yes  |
| Vote                          | No       | Yes                     | Yes       | Yes  |
| React (Phase 2)               | No       | Yes                     | Yes       | Yes  |
| Skip by vote                  | No       | Yes                     | Yes       | Yes  |
| Force skip                    | No       | No                      | Yes       | Yes  |
| Delete chat message           | No       | No                      | Yes       | Yes  |
| Remove queue item             | No       | Own item only, configurable | Yes   | Yes  |
| Mute/ban participant          | No       | No                      | Yes       | Yes  |
| Change playlist mechanic      | No       | No                      | Optional  | Yes  |
| Change room settings          | No       | No                      | Optional  | Yes  |

A Listener attempting any "No" action receives a clear prompt to claim or authenticate a protected nickname rather than a generic denial (see FR-029).

#### 9.2.2 External Integration Permission Matrix

External participants do not inherit native Trackstacc role authority from browser state. Staff authority for external integrations is derived only from configured external user ID allowlists, trusted external role mappings, or a future authenticated identity bridge. The Integration Bot is a system actor used only for signed outbound announcements and command results; it is not a user, cannot initiate privileged state changes, and must not bypass server-side authorization checks.

The native mandatory protected-nickname requirement (Sections 9.2.1, 7.2, 7.3) does **not** apply to external participants. External capabilities depend on integration configuration, song request policy, moderation state, and rate limits as below; they are never gated on a native protected nickname.

| Action / Capability                                      | External Participant | External Staff | Integration Bot |
| -------------------------------------------------------- | -------------------: | -------------: | --------------: |
| View read-only embed state                               | Yes                  | Yes            | N/A             |
| Use read-only commands (`!song`, `!np`, `!queue`, help)  | Yes                  | Yes            | N/A             |
| Submit song request (`!sr`)                              | Configurable by room/integration policy, rate limits, and moderation state | Yes, unless room is administratively closed | No |
| Cast pre-play veto vote (`!yay` / `!nay`)                | Yes, if eligible and not muted/banned/rate-limited | Yes, if eligible and not muted/banned/rate-limited | No |
| Change own active veto vote during window                | Yes                  | Yes            | No              |
| Remove own queued item                                   | Configurable         | Yes            | No              |
| Remove any queue item by reference or URL                | No                   | Yes, if staff command permission is enabled | No |
| Force skip current track                                 | No                   | Yes, if staff command permission is enabled | No |
| Change song request policy                               | No                   | Yes, if staff command permission is enabled | No |
| Change veto settings                                     | No                   | Yes, if staff command permission is enabled | No |
| Change duplicate policy or max duration                  | No                   | Yes, if staff command permission is enabled | No |
| Mute or unmute external participant                      | No                   | Yes, if moderation command permission is enabled | No |
| Bypass per-user request cooldown                         | No                   | Configurable; default yes for staff commands only | No |
| Post command result or room announcement to external chat | No                   | No             | Yes, via signed outbound webhook only |
| Read or expose integration secret                        | No                   | No             | No              |
| Act from browser-provided role/session/user identity     | No                   | No             | No              |

Authorization for External Staff must be evaluated on every command from the server-side command payload and stored integration configuration. Staff role claims from browser embeds, query strings, or unsigned client payloads are ignored.

---

## 10. UX Flows

### 10.1 Create Room Flow

1. User clicks **Create Room**.
2. User enters optional room name.
3. User chooses playlist mechanic:
   - First Come, First Served
   - Voting Queue
   - DJ Rotation
   - Host Curated
   - Suggestions Require Approval

4. User chooses basic settings:
   - Public/private link-only
   - Max song duration
   - Duplicate policy
   - Skip vote threshold

5. Server creates room and host secret.
6. User is prompted to claim or authenticate a **protected nickname** (set a password, or sign in to an existing one). Host authority requires the `member` tier, so this step is mandatory before entering as host.
7. User enters room as host (a Protected Nickname User).
8. Host can copy share link.

### 10.2 Open Room and Join Flow

This flow covers the native site. The embed/external flow is unchanged (Sections 10.6–10.18).

1. Visitor opens a room link.
2. The room loads immediately in **Listener** mode showing room name, current track, playback, participant count, and the playlist/queue. Chat is shown read-only or hidden per the room's `listener_chat_visible` setting.
3. If the room is password-protected, the room password is required to load the room at all (applies to Listeners and members alike).
4. The Listener can hear playback and browse the playlist with no further action.
5. To participate, the Listener selects **Join in / Get a nickname** (also surfaced inline wherever an interactive control is gated). They then either:
   - **Authenticate an existing protected nickname:** enter the nickname and password; the server validates server-side and rate-limits failed attempts; or
   - **Claim a new protected nickname:** enter a nickname plus a password and confirmation in one protect-and-join step (see Section 10.3 for the warnings shown).
6. The server normalizes the nickname, verifies/creates the protected nickname claim, and checks the user is not banned or blocked by policy.
7. Server creates or upgrades the room session to `member` tier.
8. Client (re)opens or upgrades the WebSocket connection with a member-tier token.
9. Server broadcasts presence update and optional system join message.
10. **Refresh & Reconnection Rehydration:** If a participant refreshes the page or experiences a transient WebSocket drop, the browser's httpOnly session cookie is used to rehydrate the existing session at the primary bootstrap endpoint (`POST /api/rooms/:roomId/listen` or `/join`). Listeners reuse their active Listener session, and members/hosts reuse their active member/host session. Stale duplicate rows are not created, and host/member authority is preserved.

A user with no protected nickname who never completes step 5 remains a Listener for the entire session.

### 10.3 Protect Nickname Flow

On the native site this flow is the gateway to participation. A Listener reaches it by choosing **Join in / Get a nickname** or by attempting any gated action.

1. Listener (or existing participant changing nickname) opens **Protect Nickname**.
2. App explains:
   - A protected nickname is required to chat, vote, add songs, and otherwise take part.
   - This prevents others from using the nickname.
   - No email recovery exists in MVP.
   - Forgotten passwords cannot be recovered, and a forgotten password means losing the ability to participate under that nickname.

3. Participant enters a nickname (if not already chosen), password, and confirmation.
4. Server validates password strength.
5. Server checks the nickname is not already protected by someone else and is not reserved/blocked.
6. Server stores the password hash and creates the nickname claim.
7. Server marks the room session as the authenticated owner of the protected nickname and upgrades it to `member` tier.
8. System confirms success; previously gated interactive controls become available immediately.

### 10.4 Add Song Flow

1. Participant pastes YouTube URL into add-song field.
2. Client extracts candidate video ID when possible.
3. Server validates URL/video ID.
4. Server fetches or reads cached metadata.
5. Server checks room rules:
   - User can add songs.
   - Not muted/banned.
   - Not rate-limited.
   - Duration acceptable.
   - Duplicate policy satisfied.
   - Mechanic-specific constraints satisfied.

6. Server creates queue item or suggestion.
7. Server broadcasts queue update and system message.

### 10.5 Change Playlist Mechanic Flow

1. Host opens room settings.
2. Host selects new playlist mechanic.
3. UI displays impact summary:
   - Current song will continue.
   - Existing queue will stay in current order by default.
   - New additions will follow the new mechanic.
   - A system message will announce the change.

4. Host confirms.
5. Server validates host permission and cooldown.
6. Server writes room setting change and audit event.
7. Server broadcasts `room.mechanic.changed`.
8. Chat shows system message.
9. Queue engine applies new mechanic to future queue operations.

### 10.6 Webmaster Creates External Site Integration Flow

1. Host opens room integration settings.
2. Host creates an external site integration.
3. Host enters site name, allowed origin, channel ID, command prefix, enabled commands, outbound bot webhook URL, bot display name, staff external user IDs, and trusted role mappings.
4. Server stores secret hashes and returns one-time integration secret material.
5. Server returns an iframe embed URL and public embed token scoped to the room and allowed origin.
6. Webmaster installs the iframe embed and configures their backend to sign or authenticate command requests.
7. Trackstacc verifies origin policy for embed access and server-to-server credentials for commands.

### 10.7 External User Requests Song with `!sr`

1. `cool.ws` user types `!sr https://www.youtube.com/watch?v=dQw4w9WgXcQ`.
2. `cool.ws` backend forwards the command to Trackstacc with integration ID, room ID, channel ID, external message ID, external user ID, display name, roles, raw command text, timestamp, signature or bearer credential, and idempotency key.
3. Trackstacc authenticates the integration.
4. Trackstacc parses the command.
5. Trackstacc maps the actor to an external participant.
6. Trackstacc validates moderation status, role permissions, song request policy, duplicate policy, duration policy, queue limits, and rate limits.
7. Trackstacc writes accepted queue changes.
8. Trackstacc returns a command result.
9. Trackstacc sends an outbound bot webhook if configured.
10. `cool.ws` posts the bot response into its chat.

### 10.8 Trackstacc Announces Pre-Play Veto Candidate

1. Current track ends or playback advances.
2. Server selects the next eligible candidate according to the active playlist mechanic.
3. If no alternate candidate exists, the server starts playback without opening a veto window.
4. If an alternate candidate exists and veto voting is enabled, the server opens a short pre-play veto window.
5. Trackstacc announces the candidate in native chat and configured external bot webhooks.

Example:

```text
Up next [K7Q]: "Song Title" requested by @alice. Vote now: !yay to keep, !nay to veto. Needs 3 net nays to skip. Voting closes in 20s.
```

### 10.9 External Users Vote `!yay` / `!nay`

1. User types `!yay`, `!nay`, `!yay K7Q`, or `!nay K7Q` in the embedding site's chat.
2. Embedding site backend forwards the command to Trackstacc.
3. Trackstacc resolves the external reference or active pre-play veto candidate.
4. Trackstacc validates the actor is an eligible voter and is not muted, banned, or rate-limited.
5. Trackstacc records or replaces the actor's active vote for the candidate.
6. Trackstacc broadcasts updated yay/nay/net-nay state.

### 10.10 Candidate Is Vetoed and Trackstacc Advances

1. Net nays reach the configured veto threshold before the voting window closes.
2. Trackstacc marks the candidate `vetoed` or equivalent.
3. Trackstacc announces the veto result.
4. Trackstacc selects the next eligible candidate and does not reselect the vetoed song immediately in the same advance cycle.

### 10.11 Candidate Passes Veto and Starts Playback

1. Voting window closes without net nays reaching the configured veto threshold.
2. Trackstacc announces the now-playing result.
3. Trackstacc starts playback and broadcasts playback state.

### 10.12 Staff Removes Queue Item by Reference

1. External staff user types `!rm K7Q`.
2. Trackstacc authenticates the integration and authorizes the actor server-side.
3. Trackstacc resolves `[K7Q]`, removes the queue item, logs the staff action, broadcasts queue changes, and posts a bot announcement.

### 10.13 Staff Changes Song Request Policy from Chat

1. External staff user types `!music requests cooldown 90`.
2. Trackstacc validates staff permission and command rate limits.
3. Trackstacc persists the new song request policy, logs the change, broadcasts settings changes, and posts a bot announcement.

### 10.14 Staff Force-Skips Current Song

1. External staff user types `!skip bad audio`.
2. Trackstacc validates staff permission.
3. Trackstacc skips the current song, records the reason in audit metadata, broadcasts playback/queue changes, and announces the action.

### 10.15 User Asks Current Song

1. External user types `!song` or `!np`.
2. Trackstacc returns the current song, requester when available, elapsed time where useful, and current external reference.

### 10.16 Staff Mutes an External Participant

1. External staff user types `!music mute @alice 30m` or `!music mute @alice` for a permanent mute.
2. Trackstacc authenticates the integration and authorizes the actor server-side.
3. Trackstacc resolves the target external user ID by display name or external user ID from the command.
4. Trackstacc updates the external participant's `moderation_status` to `muted`, records `muted_at`, computes and stores `muted_until` from the duration (or leaves `NULL` for permanent), and stores the acting staff external user ID as `muted_by`.
5. Trackstacc logs the mute action in the audit log.
6. Trackstacc broadcasts the moderation state change.
7. Trackstacc posts a bot announcement: `@alice was muted from song requests for 30 minutes.`

### 10.17 Staff Unmutes an External Participant (Early Unmute)

1. External staff user types `!music unmute @alice`.
2. Trackstacc authenticates the integration and authorizes the actor server-side.
3. Trackstacc resolves the target external user ID and verifies the participant is currently muted.
4. Trackstacc resets `moderation_status` to `active`, clears `muted_until`, `muted_at`, and `muted_by`.
5. Trackstacc logs the unmute action in the audit log.
6. Trackstacc broadcasts the moderation state change.
7. Trackstacc posts a bot announcement: `@alice was unmuted and can request songs again.`

### 10.18 Mute Auto-Expires

1. A timed mute reaches its `muted_until` timestamp.
2. On the muted participant's next command attempt (or via periodic cleanup), Trackstacc detects the mute has expired.
3. Trackstacc resets `moderation_status` to `active` and clears `muted_until`, `muted_at`, and `muted_by`.
4. No bot announcement is posted for auto-expiry (the expiry was announced when the mute was first applied).

---

## 11. Playlist Mechanics Design

### 11.1 Mechanic: First Come, First Served

**Description:** Songs play in the order they are accepted into the queue.

**Best for:** Small friend groups, casual rooms, low moderation burden.

**Rules:**

1. Accepted songs append to end of queue.
2. Duplicate and duration policies still apply.
3. Host/mods can remove or reorder items if enabled.
4. Optional per-user pending item limit prevents queue flooding.

### 11.2 Mechanic: Voting Queue

**Description:** Users add songs, and the queue priority is determined by votes.

**Best for:** Public rooms, larger rooms, parties.

**Rules:**

1. Songs enter queue with score 0.
2. Participants may upvote/downvote or only upvote, depending on room settings.
3. Next track is selected by score, then tie-breakers.
4. Tie-breakers:
   - Higher score
   - Earlier added time
   - Lower number of recent tracks by same user

5. Optional score decay prevents old songs from dominating indefinitely.
6. Host/mods can pin, remove, or skip.

### 11.3 Mechanic: DJ Rotation

**Description:** Active users take turns contributing one song at a time.

**Best for:** Fair collaborative listening where everyone gets a turn.

**Rules:**

1. Eligible DJs are active participants who opt into rotation.
2. Each DJ can have one pending track for their next turn.
3. Rotation skips users who are offline, idle, muted, or missing a track.
4. Users can pass their turn.
5. Host can remove users from rotation.
6. Current song is selected from the next eligible DJ.

### 11.4 Mechanic: Host Curated

**Description:** Only host/mods can add songs to the active queue.

**Best for:** Radio-like rooms, events, livestream-style listening.

**Rules:**

1. Participants can listen and chat.
2. Participants cannot directly add to queue.
3. Optional suggestions may be enabled separately.
4. Host/mods control order and playback.

### 11.5 Mechanic: Suggestions Require Approval

**Description:** Participants submit songs into a pending suggestions list; host/mods approve or reject.

**Best for:** Public rooms where spam prevention matters.

**Rules:**

1. User submissions enter `suggested` state.
2. Host/mod approves into queue or rejects.
3. Rejections may include optional reason.
4. Repeated rejected submissions may trigger rate limits.

### 11.6 Mechanic Changes

Mechanic changes must be treated as visible moderation/configuration actions.

**Default behavior:**

1. Current song continues uninterrupted.
2. Existing queue order is preserved.
3. New additions follow the new mechanic.
4. System message announces the change.
5. Audit event records actor, old mechanic, new mechanic, and timestamp.

**Optional advanced behavior:**

1. Host may choose **Preserve Queue**.
2. Host may choose **Recalculate Queue** when switching into voting mode.
3. Host may choose **Clear Queue** with explicit confirmation.
4. Public rooms may enforce mechanic-change cooldown.

### 11.7 Pre-Play Veto Gate

**Description:** Pre-play veto is a gate before playback starts for the next candidate. It is not the same as live skip voting for the current track. Live skip voting affects the current song during playback. Pre-play veto evaluates the selected next song before it starts, with a short window for eligible users to keep or veto it.

**Best for:** Embedded public or semi-public rooms where the host website's chat provides stable user identity and a community wants a lightweight way to reject unsuitable upcoming songs before they play.

**Rules:**

1. When the current track ends or playback advances, the server selects the next candidate according to the active playlist mechanic.
2. If pre-play veto is disabled, the candidate starts normally.
3. If no alternate candidate exists, Trackstacc plays the candidate immediately and does not open voting.
4. If an alternate candidate exists, Trackstacc opens a short pre-play veto window.
5. `!yay` means keep this candidate.
6. `!nay` means veto this candidate.
7. Each eligible user gets one active vote per candidate.
8. Users may change their vote during the voting window; the latest valid vote replaces the previous vote.
9. `netNays = nayCount - yayCount`.
10. A candidate is vetoed if net nays reaches the configured veto threshold before the window closes.
11. If the candidate is vetoed, mark it as `vetoed` or equivalent, announce the result, and select the next eligible candidate.
12. If the window closes without a veto, play the candidate.
13. A vetoed song should not be selected again immediately in the same advance cycle.
14. If repeated vetoes exhaust alternatives, the room should either play the last candidate without veto or stop gracefully according to a room setting. Recommended MVP behavior: play the last candidate without veto.
15. The requester's own vote should be configurable or at least considered in eligibility rules. Recommended MVP default: allow requester votes unless abuse data suggests otherwise.

**Voting disabled/no-effect cases:**

`!yay` and `!nay` should return a polite no-op response when:

1. No pre-play veto window is open.
2. The candidate is the only available playable song.
3. The voting window has expired.
4. The actor is not an eligible voter.
5. The actor is muted, banned, or rate-limited.
6. The room has veto voting disabled.

Example responses:

```text
No song is currently open for veto voting.
There is no alternate song in the queue, so veto voting is closed.
```

### 11.8 Veto Threshold Model

Use product-facing setting name `vetoThreshold` for pre-play veto configuration.

| Mode       | Formula                                                               | Best For                                           |
| ---------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| Fixed      | Skip if `netNays >= fixedNetNays`.                                    | Small/private rooms.                               |
| Percentage | Skip if `netNays >= ceil(eligibleVoters * percentage)`.               | Large rooms where fixed thresholds are too easy to abuse. |
| Hybrid     | `requiredNetNays = max(minimumNetNays, ceil(eligibleVoters * percentage))`. | General public-room default.                       |

Recommended default:

| Setting                         | Value  |
| ------------------------------- | ------ |
| `voteWindowSeconds`             | `20`   |
| `vetoThreshold.mode`            | `hybrid` |
| `percentageOfEligibleVoters`    | `25`   |
| `minimumNetNays`                | `3`    |
| `onlyWhenAlternateCandidateExists` | `true` |
| `oneVotePerUser`                | `true` |
| `allowVoteChange`               | `true` |

Do not expose a separate webmaster-facing keep-vote behavior setting in v1.1. `!yay` is directly defined as a keep vote that reduces net nays.

### 11.9 External References

External references are short identifiers included in bot messages so chat users and staff can target queue items without copying UUIDs.

Examples: `[K7Q]`, `[A14]`, `[NP]`.

Rules:

1. References are scoped by room, integration, and channel.
2. `!rm K7Q` and `!yay K7Q` may resolve explicitly.
3. `!yay` and `!nay` without a reference resolve to the active pre-play veto candidate.
4. References should expire after the queue item leaves relevant recent history or after a bounded retention window.
5. The bot should include references in queue, now-playing, veto, remove, and skip announcements.

### 11.10 Song Request Policy

Rooms and external integrations should support a `songRequestPolicy` setting or equivalent.

| Mode                         | Behavior                                                                                          | Best For                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `open`                       | Anyone can request songs at any time, subject to global queue, rate, duplicate, and duration limits. | Trusted small rooms.                          |
| `per_user_cooldown`          | A user can submit one accepted song every N seconds.                                               | Public embedded rooms.                        |
| `after_user_song_finishes`   | A user can request again only after their previous accepted song has finished, been skipped, vetoed, removed, or failed. | Fairness and preventing queue stacking. |
| `staff_only`                 | Only authorized staff may add tracks.                                                             | Events, streams, radio-style rooms, or high-abuse communities. |
| `closed`                     | No one may add tracks until reopened. Staff should generally not add either unless the host changes the mode. | Temporary lockdowns.                          |

Recommended default for public external integrations:

| Setting                 | Default              |
| ----------------------- | -------------------- |
| `songRequestPolicy`     | `per_user_cooldown`  |
| Cooldown                | 90 seconds           |
| `maxPendingPerUser`     | 2                    |
| `maxQueueSize`          | 50                   |
| `maxDurationSeconds`    | 600                  |
| `duplicatePolicy`       | `block_recent`       |
| Pre-play veto           | Enabled with hybrid threshold |

---

## 12. System Architecture

### 12.1 Recommended Architecture

The system should use a real-time web architecture with authoritative server-side room state.

```text
Browser Client
  ├─ React/Next.js UI
  ├─ YouTube IFrame Player
  ├─ REST API client
  └─ WebSocket client

API Layer
  ├─ Auth/session middleware
  ├─ Room API
  ├─ Nickname API
  ├─ Queue API
  ├─ Moderation API
  └─ YouTube metadata API wrapper

Realtime Layer
  ├─ WebSocket gateway
  ├─ Room event dispatcher
  ├─ Presence manager
  └─ Pub/Sub adapter

Domain Services
  ├─ Room Service
  ├─ Identity/Nickname Service
  ├─ Queue Engine
  ├─ Playback Coordinator
  ├─ Chat Service
  ├─ Moderation Service
  ├─ Rate Limit Service
  └─ Audit Service

Data Layer
  ├─ PostgreSQL for durable state
  ├─ Redis for presence, rate limits, pub/sub, ephemeral room state
  └─ Object/log storage for longer-term analytics/audit exports if needed

External Services
  ├─ YouTube IFrame Player / YouTube Data API
  └─ Embedding site chat backends / outbound bot webhooks
```

### 12.2 Selected Technology Stack

The backend framework decision is **Fastify 5 with TypeScript and Socket.IO**, matching the implementation already underway. NestJS is no longer an open option for MVP. Fastify is selected because it keeps the API layer lightweight, has first-class TypeScript support, integrates cleanly with Socket.IO, works well with Zod-style request validation, and avoids framework-level abstraction that is not needed for the current service count.

| Layer            | Decision                                         | Rationale                                         |
| ---------------- | ------------------------------------------------ | ------------------------------------------------- |
| Frontend         | Next.js 14 + React 18 + TypeScript              | Fast web UI, App Router support, SSR where useful. |
| Styling          | Tailwind CSS                                     | Rapid, consistent UI development.                 |
| Backend          | Fastify 5 + TypeScript                          | Lightweight HTTP framework aligned with the active repo and suitable for explicit domain-service boundaries. |
| Realtime         | Socket.IO                                       | Room-based events, reconnection support, and Redis adapter support. |
| Database         | PostgreSQL                                      | Durable relational state and constraints.         |
| Cache/pubsub     | Redis + `ioredis` + Socket.IO Redis adapter     | Presence, rate limiting, distributed room events. |
| ORM              | Prisma                                          | Type-safe schema access and existing root schema workflow. |
| Request validation | Zod                                           | Shared validation patterns for REST and command payloads. |
| Password hashing | Argon2id                                        | Strong password hashing for nickname protection.  |
| Deployment       | Docker Compose for local/prod; Coolify-compatible deployment | Matches current infrastructure packaging. |
| Observability    | OpenTelemetry-compatible traces, structured logs, Sentry or equivalent | Debugging real-time systems and dependency failures. |

Framework guardrails:

1. API routes should be thin Fastify handlers that delegate business rules to domain services.
2. Domain services must not depend on Fastify request or reply objects.
3. Socket.IO handlers should share authorization, validation, rate-limit, and error-mapping utilities with REST handlers.
4. Fastify plugins should be used for cross-cutting infrastructure only: configuration, Prisma, Redis, authentication, rate limits, logging, and error handling.
5. If future module count or team size justifies NestJS-style structure, evaluate that as a post-MVP architecture decision, not an MVP framework variable.

### 12.3 Server Authority

The server is authoritative for:

1. Room settings.
2. Playlist mechanic.
3. Queue state.
4. Current track selection.
5. Chat acceptance.
6. Permissions.
7. Moderation actions.
8. Rate limits.
9. Nickname authentication.
10. External integration authentication, command parsing, external participant mapping, pre-play veto state, staff command authorization, and outbound bot message creation.

The client is authoritative only for local UI state and local YouTube player events. Client player events are treated as signals, not trusted facts.

### 12.4 External Site Embeds and Chat Command Integrations

External site integrations add an integration boundary without changing Trackstacc's authority over music-room state.

**Architecture:**

1. The embedding website owns its own chat UI and user identity.
2. The embedding website backend parses or forwards relevant music commands to Trackstacc.
3. Trackstacc verifies the integration secret, HMAC signature, bearer credential, timestamp freshness, and idempotency key before processing.
4. Trackstacc maps the external user into an `ExternalParticipant` record or equivalent identity mapping.
5. Trackstacc applies room permissions, song request policy, duplicate rules, duration rules, moderation status, rate limits, and staff authorization.
6. Trackstacc mutates queue, playback, settings, and veto state only after validation.
7. Trackstacc emits realtime room events to native clients and embeds.
8. Trackstacc optionally sends a signed outbound bot webhook back to the embedding site.
9. The embedding site posts the bot response into its own chat.

**Server-to-server command payload guidance:**

| Field                   | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `integrationId`         | Identifies the external site integration.                      |
| `roomId`                | Trackstacc room UUID.                                          |
| `channelId`             | Embedding-site chat channel or room identifier.                |
| `externalMessageId`     | Stable source message ID for idempotency and audit.            |
| `externalUserId`        | Stable external user ID from the embedding site's backend.     |
| `displayName`           | User-facing display name from the embedding site.              |
| `roles`                 | Optional role strings; trusted only when configured.           |
| `rawText`               | Original command text.                                         |
| `timestamp`             | Source timestamp used for freshness and replay protection.     |
| `signature` or `bearer` | Integration authentication material.                           |
| `idempotencyKey`        | Duplicate protection key, usually derived from message ID.     |

**Command flow example:**

1. `cool.ws` user types `!sr <youtube-url>`.
2. `cool.ws` backend forwards the command payload to Trackstacc.
3. Trackstacc authenticates the integration.
4. Trackstacc parses the command.
5. Trackstacc validates the actor.
6. Trackstacc applies room policy.
7. Trackstacc writes accepted changes.
8. Trackstacc returns a command result.
9. Trackstacc also sends an outbound bot webhook if configured.

**Authority constraints** (see Section 19.5 for the authoritative external integration security specification):

1. The external website chat is a command surface, not the authority.
2. Trackstacc remains authoritative for queue writes, playback state, veto logic, staff authorization, moderation, rate limits, duplicate policy, room settings, and audit logs.
3. Do not trust browser-side role, identity, playback state, or vote state.
4. Do not expose integration secrets in iframe URLs, browser JavaScript, localStorage, or public payloads.
5. Do not let outbound webhook failure roll back successful queue, playback, vote, or settings changes.
6. Do not require Trackstacc users to register an email/account to participate in external chat integrations.
7. Preserve the no-registration native Trackstacc model.
8. Preserve YouTube compliance boundaries: metadata-only server use plus client IFrame playback.
9. Preserve current room mechanics such as FIFO, voting queue, DJ rotation, host curated, and suggestions; external pre-play veto is an additional gate, not a replacement for all mechanics.

### 12.5 Architecture Diagrams

#### 12.5.1 System Context Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        trackstacc.live                              │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Next.js Web │  │  Fastify API │  │  Background Workers      │  │
│  │  (Frontend)  │  │  + Socket.IO │  │  (Webhook retry, expiry) │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                 │                        │                │
│         │        ┌────────┴────────┐               │                │
│         │        │                 │               │                │
│  ┌──────┴──┐  ┌──┴───────┐  ┌─────┴───────┐       │                │
│  │ CDN /   │  │PostgreSQL│  │    Redis     │───────┘                │
│  │ Static  │  │  (state) │  │ (cache/pub)  │                       │
│  └─────────┘  └──────────┘  └─────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
        ▲               ▲                     ▲
        │               │                     │
   ┌────┴────┐   ┌──────┴──────┐     ┌───────┴───────┐
   │ Browser │   │  YouTube    │     │  Embedding    │
   │ Clients │   │  Data API + │     │  Site Backend │
   │         │   │  IFrame     │     │  (commands/   │
   │         │   │  Player     │     │   webhooks)   │
   └─────────┘   └─────────────┘     └───────────────┘
```

#### 12.5.2 Container Diagram

```text
┌───────────────────────────────────────────────────────────────────────────┐
│  Browser / Embed Client                                                   │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ React/Next.js  │  │ YouTube IFrame   │  │ Socket.IO Client         │  │
│  │ UI + App       │  │ Player           │  │ (room events, presence)  │  │
│  │ Router         │  │                  │  │                          │  │
│  └───────┬────────┘  └──────────────────┘  └────────────┬─────────────┘  │
│          │              REST (HTTPS)                     │  WSS           │
└──────────┼──────────────────────────────────────────────┼────────────────┘
           │                                              │
           ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Fastify API + Socket.IO Gateway (single deployable in MVP)             │
│  ┌────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐ │
│  │ Auth / Session     │  │ REST Route Handlers   │  │ Socket.IO Event │ │
│  │ Middleware         │  │ (Room, Queue, Chat,   │  │ Handlers        │ │
│  │                    │  │  Moderation, Nickname, │  │                 │ │
│  │                    │  │  Integration, Health)  │  │                 │ │
│  └────────┬───────────┘  └──────────┬────────────┘  └────────┬────────┘ │
│           │                         │                         │          │
│  ┌────────┴─────────────────────────┴─────────────────────────┴───────┐  │
│  │ Domain Services                                                    │  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────┐ │  │
│  │ │ Room     │ │ Identity │ │ Queue    │ │ Playback  │ │ Chat    │ │  │
│  │ │ Service  │ │ Service  │ │ Engine   │ │ Coord.    │ │ Service │ │  │
│  │ └──────────┘ └──────────┘ └──────────┘ └───────────┘ └─────────┘ │  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐            │  │
│  │ │Moderation│ │Rate Limit│ │ External │ │ Outbound  │            │  │
│  │ │ Service  │ │ Service  │ │ Command  │ │ Webhook   │            │  │
│  │ │          │ │          │ │ Service  │ │ Service   │            │  │
│  │ └──────────┘ └──────────┘ └──────────┘ └───────────┘            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│           │                         │                                    │
│  ┌────────┴───────┐        ┌───────┴──────────┐                         │
│  │ Prisma Client  │        │ ioredis Client   │                         │
│  └────────┬───────┘        └───────┬──────────┘                         │
└───────────┼────────────────────────┼────────────────────────────────────┘
            ▼                        ▼
   ┌────────────────┐       ┌────────────────┐
   │  PostgreSQL 16 │       │   Redis 7      │
   │  (durable      │       │   (presence,   │
   │   state)       │       │    rate limits, │
   │                │       │    pub/sub)     │
   └────────────────┘       └────────────────┘
```

#### 12.5.3 Component Dependency Direction

Domain services communicate through direct method calls within the same process. The allowed dependency directions are:

```text
REST / Socket.IO Handlers
       │
       ▼
Domain Services (may call peer services within the same tier):
  Room Service ──► Identity Service (nickname validation)
  Queue Engine ──► Rate Limit Service (song add limits)
  Queue Engine ──► Moderation Service (mute/ban check)
  Playback Coordinator ──► Queue Engine (next track selection)
  Chat Service ──► Rate Limit Service (message limits)
  Chat Service ──► Moderation Service (mute check)
  External Command Service ──► Queue Engine, Playback Coordinator,
                                Moderation Service, Rate Limit Service
  Outbound Webhook Service ◄── External Command Service, Playback Coordinator
       │
       ▼
Data Access (Prisma + ioredis)
```

Domain services must not depend on Fastify request/reply objects. Handler-to-service calls pass plain typed arguments and receive plain typed results. Cross-service calls within the domain tier are synchronous method calls in MVP; if future scale requires asynchronous decoupling, introduce an event bus at that time.

### 12.6 Sequence Diagrams

#### 12.6.1 External Song Request Lifecycle

```text
Embedding Site          Trackstacc API             Domain Services            PostgreSQL / Redis
Backend                 (External Command          (Queue Engine,
                         Handler)                   Rate Limit, Webhook)
    │                        │                          │                          │
    │ POST /api/integrations │                          │                          │
    │    /site-command       │                          │                          │
    │ {integrationId,        │                          │                          │
    │  rawText: "!sr <url>", │                          │                          │
    │  externalUserId,       │                          │                          │
    │  signature, timestamp} │                          │                          │
    ├───────────────────────►│                          │                          │
    │                        │ Verify HMAC/bearer,      │                          │
    │                        │ timestamp freshness,     │                          │
    │                        │ idempotency key          │                          │
    │                        ├─────────────────────────►│                          │
    │                        │                          │ Check rate limits (Redis) │
    │                        │                          ├─────────────────────────►│
    │                        │                          │◄─────────────────────────┤
    │                        │                          │ Check mute/ban status    │
    │                        │                          ├─────────────────────────►│
    │                        │                          │◄─────────────────────────┤
    │                        │                          │ Validate URL, fetch      │
    │                        │                          │ YouTube metadata         │
    │                        │                          │ Check duplicate/duration/ │
    │                        │                          │ queue size/pending limits │
    │                        │                          ├─────────────────────────►│
    │                        │                          │◄─────────────────────────┤
    │                        │                          │ INSERT queue_item,       │
    │                        │                          │ external_command,        │
    │                        │                          │ external_reference       │
    │                        │                          ├─────────────────────────►│
    │                        │                          │◄─────────────────────────┤
    │                        │                          │ Emit queue.item.added    │
    │                        │                          │ via Redis pub/sub →      │
    │                        │                          │ Socket.IO rooms          │
    │                        │                          ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ►│
    │                        │                          │                          │
    │                        │                          │ Enqueue outbound webhook │
    │                        │                          │ (async, non-blocking)    │
    │                        │◄─────────────────────────┤                          │
    │  200 {ok: true,        │                          │                          │
    │   resultCode:          │                          │                          │
    │   "SONG_QUEUED",       │                          │                          │
    │   message, ref}        │                          │                          │
    │◄───────────────────────┤                          │                          │
    │                        │                          │                          │
    │         (async)        │                          │                          │
    │◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤                          │
    │  Signed outbound       │                          │                          │
    │  webhook: bot message  │                          │                          │
```

#### 12.6.2 Pre-Play Veto Voting Cycle

```text
Playback              Queue Engine /            Socket.IO /           Embedding Site
Coordinator           Veto Service              Redis Pub/Sub         (via Webhook)
    │                      │                         │                      │
    │ Current track ends   │                         │                      │
    ├─────────────────────►│                         │                      │
    │                      │ Select next candidate   │                      │
    │                      │ via active mechanic     │                      │
    │                      │                         │                      │
    │                      │ Check: alternate exists? │                      │
    │                      │ Check: veto enabled?    │                      │
    │                      │                         │                      │
    │                      │ [no alternate OR veto   │                      │
    │                      │  disabled → play now]   │                      │
    │                      │                         │                      │
    │                      │ [alternate exists AND   │                      │
    │                      │  veto enabled]          │                      │
    │                      │                         │                      │
    │                      │ Open veto window        │                      │
    │                      │ INSERT preplay_veto_    │                      │
    │                      │ windows (status=open)   │                      │
    │                      │                         │                      │
    │                      │ Emit veto_window.opened │                      │
    │                      ├────────────────────────►│──── broadcast ──────►│
    │                      │                         │    "Up next [K7Q]…"  │
    │                      │                         │                      │
    │                      │   ◄── !nay from user ───│◄─── site-command ───│
    │                      │ Validate voter, record  │                      │
    │                      │ UPSERT preplay_veto_    │                      │
    │                      │ votes                   │                      │
    │                      │                         │                      │
    │                      │ Emit veto_window.updated│                      │
    │                      ├────────────────────────►│──── broadcast ──────►│
    │                      │                         │                      │
    │                      │ [netNays >= threshold]  │                      │
    │                      │ Mark candidate vetoed   │                      │
    │                      │ Emit queue.item.vetoed  │                      │
    │                      ├────────────────────────►│──── broadcast ──────►│
    │                      │                         │   "Veto passed…"     │
    │                      │                         │                      │
    │◄─────────────────────┤ Select next candidate   │                      │
    │  (loop: re-evaluate  │ (do not reselect vetoed │                      │
    │   veto for new       │  item in same cycle)    │                      │
    │   candidate)         │                         │                      │
    │                      │                         │                      │
    │                      │ [window closes without  │                      │
    │                      │  veto → play candidate] │                      │
    │                      │ Emit veto_passed        │                      │
    │◄─────────────────────┤                         │                      │
    │ Start playback       ├────────────────────────►│──── broadcast ──────►│
    │ Emit playback.state  │                         │   "Now playing…"     │
```

#### 12.6.3 Playlist Mechanic Change with Queue Transition

```text
Host Client           Fastify API             Room Service /           Socket.IO /
                      (Settings Handler)      Queue Engine             Redis Pub/Sub
    │                      │                         │                      │
    │ PATCH /api/rooms/    │                         │                      │
    │   :roomId/settings   │                         │                      │
    │ {playlistMechanic:   │                         │                      │
    │  "voting"}           │                         │                      │
    ├─────────────────────►│                         │                      │
    │                      │ Validate host session   │                      │
    │                      │ Validate cooldown       │                      │
    │                      ├────────────────────────►│                      │
    │                      │                         │ Read current room    │
    │                      │                         │ mechanic ("fifo")    │
    │                      │                         │                      │
    │                      │                         │ UPDATE rooms SET     │
    │                      │                         │ playlist_mechanic =  │
    │                      │                         │ "voting"             │
    │                      │                         │                      │
    │                      │                         │ INSERT room_settings_│
    │                      │                         │ history (actor,      │
    │                      │                         │ old=fifo, new=voting)│
    │                      │                         │                      │
    │                      │                         │ Preserve existing    │
    │                      │                         │ queue order (default)│
    │                      │                         │ Current song NOT     │
    │                      │                         │ interrupted          │
    │                      │                         │                      │
    │                      │                         │ Create system chat   │
    │                      │                         │ message: "Fredo      │
    │                      │                         │ changed playlist     │
    │                      │                         │ mode from FIFO to    │
    │                      │                         │ Voting Queue."       │
    │                      │                         │                      │
    │                      │                         │ Emit events:         │
    │                      │                         ├─────────────────────►│
    │                      │                         │ room.mechanic.changed│
    │                      │                         │ chat.message (system)│
    │                      │◄────────────────────────┤                      │
    │  200 {ok: true}      │                         │                      │
    │◄─────────────────────┤                         │                      │
    │                      │                         │                      │
    │◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │  room.mechanic.changed event via Socket.IO     │                      │
    │  chat.message (system) event via Socket.IO     │                      │
    │                      │                         │                      │
    │  UI updates mechanic │                         │                      │
    │  label; new adds     │                         │                      │
    │  follow voting rules │                         │                      │
```

---

## 13. Component Design

### 13.1 Frontend Client

Responsibilities:

1. Render room UI, adapting to the user's native access tier (Listener vs member).
2. For Listeners, render a read-only experience (playback + playlist/queue, optional read-only chat) and surface clear inline prompts to claim or authenticate a protected nickname wherever an interactive control would otherwise appear.
3. Collect nickname and password inputs for the protect-and-join / authenticate flows.
4. Display YouTube player.
5. Maintain WebSocket connection; reconnect/upgrade the token when a Listener becomes a member.
6. Render chat, queue, participant list, and room settings according to tier and role.
7. Handle optimistic UI carefully for chat and queue interactions (member tier only).
8. Report player state events to server.
9. Resync playback state when instructed.
10. Treat the tier-gating UI as a convenience only; the server remains authoritative (NFR-038).

Key pages:

| Route                   | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `/`                     | Landing page and create room entry.              |
| `/rooms/:roomSlug`      | Room experience.                                 |
| `/rooms/:roomSlug/join` | Nickname entry flow, possibly modal inside room. |
| `/terms`                | Terms of use.                                    |
| `/privacy`              | Privacy policy.                                  |

### 13.2 Room Service

Responsibilities:

1. Create rooms.
2. Store and update room settings.
3. Validate host/mod permissions.
4. Manage room visibility and password behavior.
5. Emit room setting events.
6. Track room lifecycle and inactivity expiration.

### 13.3 Identity and Nickname Service

Responsibilities:

1. Normalize nicknames.
2. Validate nickname format.
3. Check protected nickname status.
4. Verify nickname passwords.
5. Create protected nickname claims (including the single-step protect-and-join).
6. Issue room sessions at the correct native access tier: `listener` for users without an authenticated protected nickname, `member` for those with one.
7. Upgrade a `listener` session to `member` in place when the user authenticates or claims a protected nickname, without forcing a full rejoin.
8. Provide the authoritative tier and role to downstream services so every interactive action can be gated server-side (NFR-038, FR-028).
9. Prevent nickname impersonation in active rooms.

Nickname normalization rules:

1. Trim leading/trailing whitespace.
2. Collapse internal repeated whitespace if allowed.
3. Lowercase using Unicode-aware case folding.
4. Normalize Unicode form, preferably NFKC.
5. Reject control characters and invisible confusables where feasible.
6. Enforce length constraints.

Recommended nickname constraints:

1. Minimum length: 2 characters.
2. Maximum length: 24 characters.
3. Allowed characters: letters, numbers, spaces, underscores, hyphens, selected Unicode ranges.
4. Block reserved names: `admin`, `system`, `moderator`, `host`, `youtube`, `support`.
5. Block names visually confusable with system roles.

### 13.4 Queue Engine

Responsibilities:

1. Validate song additions according to room settings.
2. Apply active playlist mechanic.
3. Determine next track.
4. Manage queue item states.
5. Handle votes and skip votes.
6. Prevent user domination and spam.
7. Emit queue events.

Queue item states:

| State       | Meaning                        |
| ----------- | ------------------------------ |
| `suggested` | Submitted but not approved.    |
| `queued`    | Accepted and pending playback. |
| `playing`   | Currently selected track.      |
| `played`    | Completed normally.            |
| `skipped`   | Skipped by host/mod/vote.      |
| `removed`   | Removed before playback.       |
| `failed`    | Could not play or load.        |
| `rejected`  | Suggestion rejected.           |
| `vetoed`    | Rejected by pre-play veto before playback. |

### 13.5 Playback Coordinator

Responsibilities:

1. Maintain authoritative playback state.
2. Start tracks when selected.
3. Advance on track end or skip.
4. Broadcast playback state.
5. Handle client resync requests.
6. Handle playback failure reports.

Playback state model:

```json
{
  "roomId": "uuid",
  "queueItemId": "uuid",
  "videoId": "string",
  "status": "playing | paused | buffering | ended | stopped",
  "startedAt": "timestamp",
  "serverPositionSeconds": 42.5,
  "updatedAt": "timestamp"
}
```

MVP recommendation:

- Do not require hard synchronized play/pause for every participant.
- Maintain shared current track and approximate start time.
- On join/resync, client seeks to server-estimated position.
- Host controls skip/advance.

### 13.6 Chat Service

Responsibilities:

1. Accept chat messages only from `member`-tier participants (authenticated protected nickname); reject sends from Listeners with a "protection required" error.
2. Apply rate limits and content rules.
3. Store recent messages.
4. Broadcast chat events; gate delivery to Listeners by the room's `listener_chat_visible` setting (default off).
5. Create system messages.
6. Support deletion/moderation of messages.

Message types:

| Type         | Description                        |
| ------------ | ---------------------------------- |
| `user`       | Participant message.               |
| `system`     | Room event generated by server.    |
| `moderation` | Moderation notice.                 |
| `song`       | Song-added or now-playing message. |

### 13.7 Moderation Service

Responsibilities:

1. Enforce room mutes and bans.
2. Record moderation events.
3. Delete chat messages.
4. Remove queue items.
5. Rate-limit abusive sessions.
6. Provide room-level controls for host/mods.

Moderation identifiers:

1. Room session ID.
2. Nickname normalized key.
3. Protected nickname ID, if applicable.
4. IP hash or risk token where lawful and disclosed.
5. Device/browser fingerprinting should be avoided or minimized unless necessary and properly disclosed.

### 13.8 YouTube Metadata Service

Responsibilities:

1. Parse YouTube URLs.
2. Validate video IDs.
3. Fetch video metadata.
4. Cache metadata to reduce quota usage.
5. Detect duration and embeddability where available.
6. Return user-friendly errors.

MVP recommendation:

- Support pasted URLs first.
- Add in-app YouTube search later because search API calls are more quota-expensive.
- Cache video metadata aggressively within platform policy constraints.
- Maintain fallback behavior when metadata lookup fails.

### 13.9 Rate Limit Service

Responsibilities:

1. Limit chat message frequency.
2. Limit song additions.
3. Limit nickname changes.
4. Limit failed nickname password attempts.
5. Limit room creation from same IP/session.
6. Limit moderation-sensitive actions.

Example limits:

| Action                   | Suggested Limit                                                  |
| ------------------------ | ---------------------------------------------------------------- |
| Chat                     | 5 messages / 10 seconds per participant; configurable slow mode. |
| Add song                 | 1 song / 30 seconds per participant; stricter in public rooms.   |
| Nickname change          | 3 changes / 10 minutes.                                          |
| Failed nickname password | 5 attempts / 15 minutes per nickname + IP/session.               |
| Create room              | 5 rooms / hour per IP/session.                                   |
| Mechanic change          | 1 change / 5 minutes in public rooms.                            |

### 13.10 Embeddable Room Client

Responsibilities:

1. Render a read-only room/player/queue view for registered embedding origins.
2. Display current track, YouTube iframe player, queue preview, pre-play veto candidate, voting countdown, yay/nay/net-nay state, command hints, queue locked/request policy state, and required YouTube attribution where applicable.
3. Subscribe to realtime room events or snapshot polling appropriate for embeds.
4. Avoid accepting song requests, votes, or staff actions directly by default.
5. Avoid trusting browser-provided role, session, user identity, or integration state.
6. Avoid storing integration secrets in browser JavaScript, iframe URLs, localStorage, sessionStorage, or public payloads.

Default embed modes:

| Mode                        | Behavior                                                              |
| --------------------------- | --------------------------------------------------------------------- |
| `player_and_queue_readonly` | Shows YouTube player, current song, queue preview, policy state, and command hints. |
| `queue_readonly`            | Shows current song, queue preview, policy state, and command hints without player. |
| `compact`                   | Optional future compact display for narrow layouts.                   |
| `full_readonly`             | Optional future richer read-only room view.                           |

Voting controls may be considered in a future authenticated embed identity bridge, but they are out of scope for v1.1/MVP unless user identity can be verified server-side.

The native mandatory protected-nickname requirement (v1.4.0) does not apply to the embeddable room client. Embeds are already read-only and route any mutations through the server-to-server external command bridge using external user IDs; they neither prompt for nor require a native protected nickname. The embed's read-only listening-and-viewing surface is unchanged by v1.4.0.

### 13.11 External Command Service

Responsibilities (security constraints follow the authoritative specification in Section 19.5):

1. Authenticate inbound command requests.
2. Enforce timestamp freshness, replay protection, idempotency, strict schema validation, and rate limits.
3. Parse external chat commands using integration-specific command prefix and enabled command configuration.
4. Map external user IDs to external participants.
5. Route public commands, staff commands, and song request policy commands to domain services.
6. Sanitize raw text, display names, titles, outbound bot messages, and references.
7. Return clear command results for bot posting.
8. Store accepted and rejected command audit records where appropriate.

Public external chat commands:

| Command              | Behavior                                                            |
| -------------------- | ------------------------------------------------------------------- |
| `!sr <youtube-url>`  | Submit song request.                                                |
| `!song` or `!np`     | Show current song.                                                  |
| `!queue`             | Show upcoming queue.                                                |
| `!yay [ref]`         | Vote to keep active pre-play candidate.                             |
| `!nay [ref]`         | Vote to veto active pre-play candidate.                             |
| `!help music`        | List available music commands.                                      |

`!yay` and `!nay` should not be used as queue popularity ranking in v1.1. Queue ranking commands, if ever needed, should use separate verbs such as `!up` and `!down` to avoid confusing keep/veto with queue priority.

Staff-only external chat commands:

| Command                                   | Behavior                                                              |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `!rm <ref>`                               | Remove a queued item by short reference.                              |
| `!rm <youtube-url>`                       | Remove queued item matching a YouTube video URL.                      |
| `!skip`                                   | Force skip current song.                                              |
| `!skip <reason>`                          | Force skip current song and include reason in announcement/audit log. |
| `!music lock`                             | Disable public song requests.                                         |
| `!music unlock`                           | Re-enable public song requests according to the prior/default policy. |
| `!music requests open`                    | Allow requests from anyone.                                           |
| `!music requests cooldown <seconds>`      | Allow one request every N seconds per user.                           |
| `!music requests after-play`              | Allow request again after user's previous accepted song resolves.     |
| `!music requests staff-only`              | Only authorized staff may add tracks.                                 |
| `!music requests closed`                  | No one may add tracks.                                                |
| `!music veto on`                          | Enable pre-play veto.                                                 |
| `!music veto off`                         | Disable pre-play veto.                                                |
| `!music veto window <seconds>`            | Set pre-play veto window length.                                      |
| `!music veto fixed <count>`               | Set fixed net-nay threshold.                                          |
| `!music veto hybrid <percent> min <count>` | Set hybrid veto threshold.                                            |
| `!music max-duration <seconds>`           | Set max song duration.                                                |
| `!music duplicate <policy>`               | Set duplicate policy.                                                 |
| `!music mute <@displayName \| externalUserId> [duration]` | Mute an external participant from song requests and votes. Duration: `<N>s` (seconds), `<N>m` (minutes), `<N>h` (hours), `<N>d` (days), or `forever`/omit for permanent. Example: `!music mute @alice 30m`. |
| `!music unmute <@displayName \| externalUserId>` | Lift an active mute before it expires (early unmute). Example: `!music unmute @alice`. |

Staff command rules:

1. Staff commands must be authorized server-side using mapped external user IDs or trusted external roles configured by the webmaster/host.
2. Staff actions must be audit logged.
3. Staff actions should produce system/bot messages.
4. Settings changes should broadcast to connected embeds and clients.
5. Settings changes should be rate-limited.
6. Destructive or broad actions should require explicit authorization and may require confirmation in future phases.
7. The system must not trust a role string from the external site unless the integration is configured to trust that role or maps it to a Trackstacc staff permission.

### 13.12 Outbound Bot Webhook Service

Responsibilities:

1. Sign outbound bot messages.
2. Deliver command results and announcements to configured embedding-site webhook URLs.
3. Use bounded retry policy with backoff and duplicate-safe delivery identifiers.
4. Record webhook delivery success, failure, retries, and latency.
5. Ensure webhook failure does not roll back successful domain changes.

Example bot messages:

| Event              | Message                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Song queued        | `Queued [K7Q] "Song Title" - requested by @alice. Position: 4.`                                             |
| Up next            | `Up next [K7Q]: "Song Title" requested by @alice. Vote now: !yay to keep, !nay to veto. Needs 3 net nays to skip. Voting closes in 20s.` |
| Veto passed        | `Veto passed for [K7Q]: 5 nays, 1 yay - skipping "Song Title".`                                             |
| Song starts        | `Now playing [K7Q]: "Song Title" requested by @alice.`                                                     |
| No vote open       | `No song is currently open for veto voting.`                                                               |
| Only one song      | `There is no alternate song in the queue, so veto voting is closed.`                                       |
| Staff remove       | `Removed [K7Q] "Song Title" from the queue.`                                                              |
| Staff skip         | `@mod skipped "Song Title". Reason: bad audio.`                                                           |
| Policy changed     | `Song requests are now limited to 1 request every 90 seconds per user.`                                    |
| User muted         | `@alice was muted from song requests for 30 minutes.`                                                    |
| User unmuted       | `@alice was unmuted and can request songs again.`                                                        |

### 13.13 Presence Manager

Responsibilities:

1. Maintain native room presence keyed by stable room session identity (`room_sessions.id`) rather than socket ID or display name.
2. Reconcile multiple sockets or tabs opened under the same active room session to a single visible participant row.
3. Reuse active Listener sessions on refresh (via cookie rehydration at `/listen`) to avoid creating duplicate Listener entries.
4. Reuse active member/host sessions on refresh/reconnect (preserving member and host authority without leaving stale rows behind).
5. Track active presence using Redis ZSETs where room sessions are mapped to the current epoch timestamp, and set a 24-hour TTL on the presence key.
6. Periodically sweep inactive sessions (older than 60 seconds) out of Redis and update PostgreSQL `room_sessions` to set `leftAt = now` where `leftAt IS NULL`.
7. Fail gracefully to PostgreSQL `lastSeenAt` / `leftAt` index queries when Redis is degraded or unavailable, ensuring presence remains bounded and approximate (capped at a 60-second lag) instead of producing unbounded participant list duplication.
8. Scopes presence monitoring to native room participants; external participants are explicitly out of scope.

---

## 14. Data Model

### 14.1 Entity Relationship Overview

```text
nickname_claims 1---many room_sessions
rooms 1---many room_sessions
rooms 1---many queue_items
rooms 1---many chat_messages
rooms 1---many room_moderation_actions
rooms 1---many room_settings_history
queue_items 1---many queue_votes
queue_items 1---many skip_votes
rooms 1---many site_integrations
site_integrations 1---many external_participants
site_integrations 1---many external_commands
site_integrations 1---many external_references
queue_items 1---many preplay_veto_votes
queue_items 1---many preplay_veto_windows
```

### 14.2 Tables

#### `nickname_claims`

Stores protected nicknames.

| Column                | Type           | Notes                           |
| --------------------- | -------------- | ------------------------------- |
| `id`                  | UUID           | Primary key.                    |
| `normalized_nickname` | TEXT UNIQUE    | Case-folded canonical nickname. |
| `display_nickname`    | TEXT           | Preferred display casing.       |
| `password_hash`       | TEXT           | Argon2id/bcrypt hash.           |
| `created_at`          | TIMESTAMP      | Creation time.                  |
| `updated_at`          | TIMESTAMP      | Last update.                    |
| `last_used_at`        | TIMESTAMP NULL | Last successful auth.           |
| `status`              | ENUM           | `active`, `locked`, `released`. |

Indexes:

- Unique index on `normalized_nickname` where `status = active`.

#### `rooms`

Stores room configuration.

| Column                      | Type           | Notes                                                    |
| --------------------------- | -------------- | -------------------------------------------------------- |
| `id`                        | UUID           | Primary key.                                             |
| `slug`                      | TEXT UNIQUE    | Public room identifier.                                  |
| `name`                      | TEXT           | Room display name.                                       |
| `description`               | TEXT NULL      | Optional description.                                    |
| `visibility`                | ENUM           | `private_link`, `public`, `password_protected`.          |
| `room_password_hash`        | TEXT NULL      | Optional room password.                                  |
| `host_secret_hash`          | TEXT           | Hash of host secret.                                     |
| `playlist_mechanic`         | ENUM           | Active mechanic.                                         |
| `max_song_duration_seconds` | INTEGER        | Default e.g. 600.                                        |
| `duplicate_policy`          | ENUM           | `allow`, `block_queue`, `block_recent`, `block_session`. |
| `skip_vote_threshold_type`  | ENUM           | `percentage`, `fixed_count`.                             |
| `skip_vote_threshold_value` | INTEGER        | Example 50 or 3.                                         |
| `queue_locked`              | BOOLEAN        | Whether normal users can add.                            |
| `chat_locked`               | BOOLEAN        | Whether normal users can chat.                           |
| `listener_chat_visible`     | BOOLEAN        | Whether native Listeners (no protected nickname) may read chat. Default FALSE (FR-078). |
| `external_chat_music`       | JSONB          | External embed/chat configuration such as embed mode, command prefix, enabled commands, song request policy, pre-play veto config, staff permissions, duplicate policy, max queue size, max pending per user, max duration, webhook config, allowed origins, and abuse/rate-limit settings. |
| `created_at`                | TIMESTAMP      | Creation time.                                           |
| `updated_at`                | TIMESTAMP      | Last settings update.                                    |
| `expires_at`                | TIMESTAMP NULL | For temporary rooms.                                     |
| `last_active_at`            | TIMESTAMP      | Room activity.                                           |

##### `external_chat_music` JSONB Schema

The `external_chat_music` column stores the full external integration configuration for a room. While this column uses JSONB for flexibility and atomic reads/writes, it must conform to the following documented schema. The application layer validates this schema on every write using Zod (or equivalent runtime validator). Invalid payloads are rejected with error code `INVALID_EXTERNAL_CONFIG`.

```jsonc
{
  // Embed configuration
  "embedMode": "readonly" | "interactive",           // Default: "readonly"

  // Command routing
  "commandPrefix": "!",                               // 1–5 character string, default "!"
  "enabledCommands": ["sr", "song", "np", "queue", "yay", "nay", "help"],

  // Song request policy
  "songRequestPolicy": {
    "mode": "open" | "cooldown" | "allowlist" | "closed",  // Default: "cooldown"
    "cooldownSeconds": 120,                                  // Required when mode = "cooldown"
    "allowlistExternalUserIds": []                           // Required when mode = "allowlist"
  },

  // Pre-play veto configuration
  "preplayVeto": {
    "enabled": false,                                   // Default: false
    "windowSeconds": 30,                                // 10–120, default 30
    "thresholdType": "hybrid",                          // "fixed" | "percentage" | "hybrid"
    "minimumNetNays": 3,                                // >= 1
    "percentageThreshold": 0.5,                         // 0.0–1.0, used when hybrid or percentage
    "maxConsecutiveVetoes": 3                            // >= 1
  },

  // Staff permissions
  "staffPermissions": {
    "canRemove": true,
    "canSkip": true,
    "canMute": true,
    "canChangePolicy": true,
    "canChangeVetoSettings": false,
    "canChangeDuration": false,
    "canChangeDuplicatePolicy": false
  },

  // Queue limits
  "duplicatePolicy": "block_queue" | "block_recent" | "allow" | "block_session",
  "maxQueueSize": 50,                                   // 1–500, default 50
  "maxPendingPerUser": 3,                                // 1–20, default 3
  "maxSongDurationSeconds": 600,                         // 30–3600, default 600

  // Webhook configuration
  "webhook": {
    "outboundUrl": "https://...",                        // Optional, valid HTTPS URL
    "botDisplayName": "TrackstaccBot",                   // Optional, 1–32 characters
    "retryPolicy": {
      "maxRetries": 3,                                   // 0–5, default 3
      "backoffBaseSeconds": 2                            // 1–10, default 2
    }
  },

  // Origin and abuse controls
  "allowedOrigins": ["https://example.com"],             // Array of valid HTTPS origins
  "rateLimits": {
    "commandsPerMinutePerUser": 10,                      // 1–60, default 10
    "commandsPerMinuteGlobal": 100,                      // 10–1000, default 100
    "duplicateWindowSeconds": 5                           // 1–60, default 5
  }
}
```

**Validation rules enforced on write:**

1. `commandPrefix` must be 1–5 non-whitespace characters and unique per room per channel (application-layer check against `site_integrations`).
2. `enabledCommands` must be a subset of the recognized command set. Unknown commands are rejected.
3. `songRequestPolicy.mode` determines which sub-fields are required. `cooldownSeconds` is required and must be > 0 when mode is `cooldown`. `allowlistExternalUserIds` is required and non-empty when mode is `allowlist`.
4. `preplayVeto.windowSeconds` must be between 10 and 120.
5. `preplayVeto.minimumNetNays` must be >= 1.
6. `maxQueueSize`, `maxPendingPerUser`, and `maxSongDurationSeconds` must be positive integers within documented ranges.
7. `webhook.outboundUrl` must be a valid HTTPS URL if provided.
8. `allowedOrigins` entries must be valid HTTPS origins.
9. `rateLimits` values must be positive integers within documented ranges.

**Decomposition evaluation:** This configuration was evaluated for normalization into separate relational tables. The decision is to **retain the JSONB column for MVP** for the following reasons: the configuration is always read and written atomically as a unit during room settings updates, it does not participate in cross-row joins or WHERE clauses, and it avoids a complex multi-table transaction for what is conceptually a single settings object. The documented schema above with application-layer Zod validation provides equivalent data integrity to column-level constraints for this use case. In Phase 2, if per-field querying or independent update patterns emerge (for example, an admin dashboard filtering rooms by `songRequestPolicy.mode`), the `songRequestPolicy`, `preplayVeto`, `staffPermissions`, `webhook`, and `rateLimits` sub-objects should be promoted to dedicated relational tables or at minimum backed by generated columns with indexes.

#### `room_sessions`

Represents participants in rooms, including read-only Listeners.

| Column                | Type           | Notes                                   |
| --------------------- | -------------- | --------------------------------------- |
| `id`                  | UUID           | Primary key.                            |
| `room_id`             | UUID           | FK to rooms.                            |
| `access_tier`         | ENUM           | `listener` or `member`. `member` requires a non-null `nickname_claim_id`. Default `listener`. |
| `nickname_claim_id`   | UUID NULL      | FK to the authenticated protected nickname. NULL for Listeners; required for `member` tier. |
| `normalized_nickname` | TEXT NULL      | Current nickname key. NULL for Listeners (no nickname assigned). |
| `display_nickname`    | TEXT NULL      | Display nickname. NULL for Listeners.   |
| `role`                | ENUM           | `listener`, `participant`, `moderator`, `host`. Roles above `listener` require `access_tier = member`. |
| `session_token_hash`  | TEXT           | Token hash. Encodes the access tier so tier can be checked on every request/event. |
| `is_muted`            | BOOLEAN        | Room-level mute.                        |
| `is_banned`           | BOOLEAN        | Room-level ban.                         |
| `joined_at`           | TIMESTAMP      | Initial join.                           |
| `last_seen_at`        | TIMESTAMP      | Presence update.                        |
| `left_at`             | TIMESTAMP NULL | Last leave.                             |

Constraints:

- Unique active nickname per room, enforced only for `member`-tier sessions, unless the same authenticated session is reconnecting. Listener sessions are exempt because they hold no nickname.
- `access_tier = member` requires a non-null `nickname_claim_id`, `normalized_nickname`, and `display_nickname` (application-layer and/or CHECK constraint).
- `role` may only be `participant`, `moderator`, or `host` when `access_tier = member`.
- A `listener` session is upgraded in place to `member` when the user authenticates or claims a protected nickname; the upgrade populates the nickname columns and `nickname_claim_id`.
- Active presence status is server-authoritative and depends on the session being actively registered in Redis presence ZSET (or having a PostgreSQL `lastSeenAt` value within the 60-second timeout threshold if Redis is degraded) in addition to having `leftAt` set to `null`.

#### `tracks`

Stores cached YouTube video metadata.

| Column                | Type           | Notes                            |
| --------------------- | -------------- | -------------------------------- |
| `id`                  | UUID           | Primary key.                     |
| `provider`            | ENUM           | `youtube`.                       |
| `provider_video_id`   | TEXT           | YouTube video ID.                |
| `title`               | TEXT NULL      | Video title.                     |
| `channel_title`       | TEXT NULL      | Channel name.                    |
| `thumbnail_url`       | TEXT NULL      | Thumbnail.                       |
| `duration_seconds`    | INTEGER NULL   | Duration.                        |
| `is_embeddable`       | BOOLEAN NULL   | If known.                        |
| `metadata_status`     | ENUM           | `complete`, `partial`, `failed`. |
| `metadata_fetched_at` | TIMESTAMP NULL | Last fetch.                      |
| `created_at`          | TIMESTAMP      | Creation time.                   |

Indexes:

- Unique index on `(provider, provider_video_id)`.

#### `queue_items`

Stores room queue entries.

| Column                | Type           | Notes                       |
| --------------------- | -------------- | --------------------------- |
| `id`                  | UUID           | Primary key.                |
| `room_id`             | UUID           | FK to rooms.                |
| `track_id`            | UUID           | FK to tracks.               |
| `added_by_session_id` | UUID NULL      | FK to room_sessions.        |
| `status`              | ENUM           | Queue item state.           |
| `position`            | INTEGER NULL   | FIFO/manual order.          |
| `score`               | INTEGER        | Vote score.                 |
| `mechanic_context`    | JSONB          | Mechanic-specific metadata. |
| `started_at`          | TIMESTAMP NULL | Playback started.           |
| `ended_at`            | TIMESTAMP NULL | Playback ended.             |
| `created_at`          | TIMESTAMP      | Added time.                 |
| `updated_at`          | TIMESTAMP      | Updated time.               |

#### `queue_votes`

Stores queue votes.

| Column            | Type      | Notes                |
| ----------------- | --------- | -------------------- |
| `id`              | UUID      | Primary key.         |
| `queue_item_id`   | UUID      | FK to queue_items.   |
| `room_session_id` | UUID      | FK to room_sessions. |
| `vote`            | SMALLINT  | `1` or `-1`.         |
| `created_at`      | TIMESTAMP | Vote time.           |
| `updated_at`      | TIMESTAMP | Changed vote time.   |

Constraint:

- Unique `(queue_item_id, room_session_id)`.

#### `skip_votes`

Stores skip votes for current track.

| Column            | Type      | Notes         |
| ----------------- | --------- | ------------- |
| `id`              | UUID      | Primary key.  |
| `queue_item_id`   | UUID      | Current item. |
| `room_session_id` | UUID      | Voter.        |
| `created_at`      | TIMESTAMP | Vote time.    |

Constraint:

- Unique `(queue_item_id, room_session_id)`.

#### `chat_messages`

Stores chat and system messages.

| Column                  | Type           | Notes                                   |
| ----------------------- | -------------- | --------------------------------------- |
| `id`                    | UUID           | Primary key.                            |
| `room_id`               | UUID           | FK to rooms.                            |
| `sender_session_id`     | UUID NULL      | Null for system messages.               |
| `message_type`          | ENUM           | `user`, `system`, `moderation`, `song`. |
| `body`                  | TEXT           | Sanitized message body.                 |
| `metadata`              | JSONB          | Optional structured metadata.           |
| `deleted_at`            | TIMESTAMP NULL | Soft deletion.                          |
| `deleted_by_session_id` | UUID NULL      | Moderator who deleted.                  |
| `created_at`            | TIMESTAMP      | Message time.                           |

#### `room_moderation_actions`

Stores moderation actions.

| Column              | Type      | Notes                                                                                  |
| ------------------- | --------- | -------------------------------------------------------------------------------------- |
| `id`                | UUID      | Primary key.                                                                           |
| `room_id`           | UUID      | FK to rooms.                                                                           |
| `actor_session_id`  | UUID NULL | Host/mod/system.                                                                       |
| `target_session_id` | UUID NULL | Target participant.                                                                    |
| `action_type`       | ENUM      | `mute`, `unmute`, `ban`, `unban`, `delete_message`, `remove_queue_item`, `force_skip`. |
| `reason`            | TEXT NULL | Optional reason.                                                                       |
| `metadata`          | JSONB     | Details.                                                                               |
| `created_at`        | TIMESTAMP | Action time.                                                                           |

#### `room_settings_history`

Stores room setting changes.

| Column             | Type      | Notes            |
| ------------------ | --------- | ---------------- |
| `id`               | UUID      | Primary key.     |
| `room_id`          | UUID      | FK to rooms.     |
| `actor_session_id` | UUID NULL | Host/mod/system. |
| `setting_key`      | TEXT      | Changed setting. |
| `old_value`        | JSONB     | Previous value.  |
| `new_value`        | JSONB     | New value.       |
| `created_at`       | TIMESTAMP | Change time.     |

#### `site_integrations`

Logical entity for external website integrations. Exact Prisma naming may differ.

| Column                    | Type           | Notes                                            |
| ------------------------- | -------------- | ------------------------------------------------ |
| `id`                      | UUID           | Primary key.                                     |
| `room_id`                 | UUID           | FK to rooms.                                     |
| `site_name`               | TEXT           | Webmaster-facing site name.                      |
| `site_origin`             | TEXT           | Primary registered origin.                       |
| `channel_id`              | TEXT           | Embedding-site chat channel identifier.          |
| `command_prefix`          | TEXT           | Example `!`.                                     |
| `inbound_secret_hash`     | TEXT           | Hash of inbound signing/bearer secret.           |
| `outbound_webhook_url`    | TEXT NULL      | Optional bot webhook endpoint.                   |
| `outbound_secret_hash`    | TEXT NULL      | Hash of outbound webhook signing secret.         |
| `bot_display_name`        | TEXT NULL      | Suggested bot name for external chat.            |
| `enabled`                 | BOOLEAN        | Whether integration is active.                   |
| `allowed_origins`         | JSONB          | Origins allowed to frame or load embed.          |
| `trusted_external_roles`  | JSONB          | External roles mapped to Trackstacc permissions. |
| `staff_external_user_ids` | JSONB          | Explicit staff allowlist by external user ID.    |
| `created_at`              | TIMESTAMP      | Creation time.                                   |
| `updated_at`              | TIMESTAMP      | Last update.                                     |

#### `external_participants`

| Column                   | Type           | Notes                                          |
| ------------------------ | -------------- | ---------------------------------------------- |
| `id`                     | UUID           | Primary key.                                   |
| `integration_id`         | UUID           | FK to site integrations.                       |
| `room_id`                | UUID           | FK to rooms.                                   |
| `external_user_id`       | TEXT           | Stable external user ID.                       |
| `display_name`           | TEXT           | Latest display name.                           |
| `normalized_name`        | TEXT           | Normalized display name for moderation/search. |
| `mapped_room_session_id` | UUID NULL      | Optional native room session mapping.          |
| `moderation_status`      | ENUM           | `active`, `muted`, `banned`, `limited`.        |
| `muted_until`            | TIMESTAMP NULL | When a timed mute expires. NULL for permanent. |
| `muted_at`               | TIMESTAMP NULL | When the mute was applied.                     |
| `muted_by`               | TEXT NULL      | External user ID of staff who applied the mute. |
| `last_seen_at`           | TIMESTAMP      | Last command or integration activity.          |

Constraint:

- Unique `(integration_id, room_id, external_user_id)`.

#### `external_commands`

| Column                   | Type      | Notes                                            |
| ------------------------ | --------- | ------------------------------------------------ |
| `id`                     | UUID      | Primary key.                                     |
| `integration_id`         | UUID      | FK to site integrations.                         |
| `room_id`                | UUID      | FK to rooms.                                     |
| `channel_id`             | TEXT      | External chat channel.                           |
| `external_message_id`    | TEXT      | Source message ID for idempotency.               |
| `actor_external_user_id` | TEXT      | Actor from embedding site backend.               |
| `raw_text`               | TEXT      | Sanitized or safely stored command text.         |
| `parsed_command`         | TEXT      | Command verb/category.                           |
| `status`                 | ENUM      | `received`, `accepted`, `rejected`, `duplicate`. |
| `result_code`            | TEXT      | Stable result or error code.                     |
| `created_at`             | TIMESTAMP | Command time.                                    |

Constraint:

- Unique `(integration_id, channel_id, external_message_id)`.

#### `external_references`

| Column           | Type           | Notes                                          |
| ---------------- | -------------- | ---------------------------------------------- |
| `id`             | UUID           | Primary key.                                   |
| `integration_id` | UUID           | FK to site integrations.                       |
| `room_id`        | UUID           | FK to rooms.                                   |
| `channel_id`     | TEXT           | External chat channel.                         |
| `ref`            | TEXT           | Short reference such as `K7Q`.                 |
| `queue_item_id`  | UUID NULL      | FK to queue item when applicable.              |
| `kind`           | ENUM           | `queue_item`, `now_playing`, `veto_candidate`. |
| `expires_at`     | TIMESTAMP NULL | Expiration/lifecycle boundary.                 |

#### `preplay_veto_votes`

| Column             | Type      | Notes                     |
| ------------------ | --------- | ------------------------- |
| `id`               | UUID      | Primary key.              |
| `room_id`          | UUID      | FK to rooms.              |
| `queue_item_id`    | UUID      | FK to queue items.        |
| `integration_id`   | UUID NULL | FK for external voters.   |
| `external_user_id` | TEXT NULL | External voter ID.        |
| `room_session_id`  | UUID NULL | Optional native voter ID. |
| `vote`             | ENUM      | `yay`, `nay`.             |
| `created_at`       | TIMESTAMP | Creation time.            |
| `updated_at`       | TIMESTAMP | Last vote change.         |

Constraint:

- Unique active vote per candidate per eligible voter identity.

#### `preplay_veto_windows`

| Column               | Type      | Notes                                     |
| -------------------- | --------- | ----------------------------------------- |
| `id`                 | UUID      | Primary key.                              |
| `room_id`            | UUID      | FK to rooms.                              |
| `queue_item_id`      | UUID      | FK to queue items.                        |
| `status`             | ENUM      | `open`, `vetoed`, `passed`, `expired`.    |
| `opened_at`          | TIMESTAMP | Window open time.                         |
| `closes_at`          | TIMESTAMP | Window close time.                        |
| `threshold_snapshot` | JSONB     | Veto threshold evaluated for this window. |
| `result`             | JSONB     | Final counts and outcome.                 |

### 14.3 Database Migration Strategy

#### 14.3.1 Tooling

Database schema evolution uses **Prisma Migrate** as the authoritative migration tooling, consistent with the Prisma ORM selection in Section 12.2. The root Prisma schema lives at `prisma/schema.prisma` and is accessed through the API package workspace wrapper.

Key practices:

1. Every schema change requires a named migration created with `prisma migrate dev --name <descriptive_name>`.
2. Migrations are committed to version control alongside the code changes they support.
3. Production deployments apply pending migrations with `prisma migrate deploy`, which runs non-interactively and does not create new migration files.
4. Migration history is tracked in the `_prisma_migrations` table, which Prisma manages automatically.
5. Developers must run `prisma validate` before committing schema changes.

#### 14.3.2 Zero-Downtime Migration Patterns

Schema changes must follow expand-contract patterns to avoid downtime during rolling deployments:

1. **Adding columns:** Add as nullable with a default or as `NULL`-allowed. Backfill in a subsequent migration or background task. Make non-nullable only after all rows are populated and application code handles the new column.
2. **Removing columns:** Stop reading the column in application code first. Deploy that change. Then remove the column in a subsequent migration.
3. **Renaming columns:** Create the new column, backfill, update application code to read/write the new column, deploy, then drop the old column.
4. **Adding indexes:** Use `CREATE INDEX CONCURRENTLY` where supported by the migration tooling, or schedule index creation during low-traffic windows. Prisma migrations that add indexes should be reviewed for lock impact.
5. **Changing column types:** Prefer adding a new column with the desired type, backfilling, switching reads, then dropping the old column. Direct `ALTER COLUMN ... TYPE` may lock the table for large tables.
6. **Adding tables:** Safe to deploy at any time; no existing code depends on the new table.
7. **Removing tables:** Stop all application access first; drop in a subsequent migration after confirming no references remain.

#### 14.3.3 Rollback Procedures

1. Prisma Migrate does not generate automatic down-migrations. Rollback migrations must be written manually when the risk of a migration warrants it.
2. For high-risk migrations (column renames, type changes, data transformations), prepare a corresponding rollback SQL script and test it in staging before production deployment.
3. Database backups must be taken before applying high-risk migrations in production.
4. If a migration fails partway, Prisma marks it as failed in `_prisma_migrations`. Resolve by fixing the migration SQL and running `prisma migrate resolve --applied <migration_name>` or `--rolled-back <migration_name>` as appropriate.

#### 14.3.4 Migration Testing

1. Run `prisma migrate dev` in the local Docker-backed development environment before committing.
2. CI runs `prisma migrate deploy` against a disposable test database to verify migration applicability.
3. Staging environments mirror production schema state; migrations are deployed to staging before production.
4. Seed data is maintained separately from migrations via `prisma db seed` and must not be included in migration files.

---

## 15. API Design

### 15.1 REST API Principles

1. REST endpoints handle request/response operations.
2. WebSocket events handle real-time propagation.
3. All writes are validated server-side.
4. Client-provided role, nickname auth, queue state, or playback state must not be trusted.
5. Use idempotency keys for sensitive repeated actions where useful.

#### 15.1.1 API Versioning Strategy

All REST endpoints use a URL path prefix: `/api/v1/`. The current version is `v1`. When breaking changes are introduced (field removal, incompatible type changes, removed endpoints, changed authentication flows), a new version prefix (`/api/v2/`) is created and the previous version is maintained for a documented deprecation period. Additive changes (new optional fields, new endpoints, new enum values) do not require a version bump but must be documented in a changelog.

External integrations using the command endpoint (`/api/v1/integrations/site-command`) are versioned under the same scheme. Breaking changes to the external command payload or response envelope require a new API version.

#### 15.1.2 HTTP Status Code Conventions

Standard HTTP status codes follow the conventions documented in Section 23.3. All REST responses include a `Content-Type: application/json` header. Success responses use the following codes:

| Status | Usage |
| ------ | ----- |
| `200` | Successful read, update, or action that returns a body. |
| `201` | Successful resource creation (room, queue item, integration, nickname claim). |
| `204` | Successful action with no response body (delete, acknowledge). |

Error responses use the structured envelope from Section 23.2.1 and the status codes from Section 23.3.

#### 15.1.3 Pagination Format

List endpoints that may return unbounded results use cursor-based pagination. The cursor is an opaque string (typically a base64-encoded composite of the sort key and row identifier). Offset-based pagination is not used because it performs poorly with real-time insertions and deletions.

Paginated request format:

```text
GET /api/v1/rooms/:roomId/chat/messages?before=<cursor>&limit=<n>
```

Paginated response format:

```json
{
  "data": [ ... ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA2LTA1VDIwOjAwOjAwLjAwMFoiLCJpZCI6InV1aWQifQ"
  }
}
```

Pagination parameters:

| Parameter | Type   | Default | Max | Description |
| --------- | ------ | ------- | --- | ----------- |
| `limit`   | integer | 50     | 100 | Number of items to return. |
| `before`  | string  | (none) | N/A | Cursor for backward pagination (older items). |
| `after`   | string  | (none) | N/A | Cursor for forward pagination (newer items). |

Endpoints supporting pagination: chat messages, queue items (history), room moderation actions, room settings history, external commands (audit), and external participants.

#### 15.1.4 Rate Limit Response Headers

All rate-limited endpoints return the following headers on every response, including successful ones:

| Header | Description |
| ------ | ----------- |
| `X-RateLimit-Limit` | Maximum number of requests allowed in the current window. |
| `X-RateLimit-Remaining` | Number of requests remaining in the current window. |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the current window resets. |
| `Retry-After` | Seconds until the client should retry. Present only on `429` responses. |

Rate limit windows vary by action (see Section 13.9 for per-action limits). When a request is rejected due to rate limiting, the response uses HTTP `429` with error code `RATE_LIMITED` or the applicable domain-specific rate limit code (e.g., `SONG_REQUEST_COOLDOWN`, `NICKNAME_PASSWORD_RATE_LIMITED`).

#### 15.1.5 Request ID and Correlation

Every API request is assigned a unique request ID. If the client sends an `X-Request-Id` header, the server uses it; otherwise, the server generates one. The request ID is returned in the `X-Request-Id` response header and included in structured logs, error responses, and audit entries. External command results also include the request ID for cross-system correlation.

> **Implementation note:** Request ID middleware is registered in `apps/api/src/main.ts` via Fastify's `genReqId` option (using `nanoid(21)`) and `requestIdHeader: "X-Request-Id"`. The ID is available as `request.id` and propagated in the `X-Request-Id` response header. Socket.IO events generate a `ws_`-prefixed request ID via `generateEventRequestId()` in `apps/api/src/realtime/request-id.ts`.

#### 15.1.6 Naming Conventions

| Context | Convention | Examples |
| ------- | ---------- | -------- |
| Database columns | `snake_case` | `room_id`, `display_nickname`, `created_at` |
| API request/response payloads | `camelCase` | `roomId`, `displayNickname`, `createdAt` |
| WebSocket event names | `dot.separated` with `snake_case` segments | `room.mechanic.changed`, `queue.item.veto_window.opened` |
| Enum values (data/events) | `snake_case` | `fifo`, `voting`, `dj_rotation`, `host_curated`, `per_user_cooldown` |
| Enum display text | Title Case or descriptive | "First Come, First Served", "Voting Queue" |
| Error codes | `UPPER_SNAKE_CASE` | `VIDEO_TOO_LONG`, `QUEUE_LOCKED` |

### 15.2 REST Endpoints

#### Room Endpoints

```http
POST /api/rooms
GET /api/rooms/:roomId
PATCH /api/rooms/:roomId/settings
POST /api/rooms/:roomId/host/claim
POST /api/rooms/:roomId/password/verify
```

`POST /api/rooms` request:

```json
{
  "name": "Friday Night Aux",
  "playlistMechanic": "voting",
  "visibility": "private_link",
  "maxSongDurationSeconds": 600,
  "duplicatePolicy": "block_queue"
}
```

Response:

```json
{
  "room": {
    "id": "uuid",
    "slug": "friday-night-aux-a8x4",
    "name": "Friday Night Aux",
    "playlistMechanic": "voting"
  },
  "hostToken": "one-time-or-cookie-backed-secret"
}
```

#### Nickname and Session Endpoints

```http
POST /api/nicknames/check
POST /api/nicknames/protect
POST /api/nicknames/authenticate
POST /api/rooms/:roomId/listen
POST /api/rooms/:roomId/join
POST /api/rooms/:roomId/nickname/change
```

`POST /api/rooms/:roomId/listen` serves as the primary room bootstrap and same-session rehydration path:
1. **Bootstrap / Listener Entry:** If no active session exists in the browser cookies, it establishes a read-only **Listener** session (native access tier `listener`). It requires no nickname or password; it requires the room password only if the room is password-protected.
2. **Session Rehydration:** If a valid HttpOnly `session_token` cookie representing an existing active session (such as a host or member) is present, the endpoint rehydrates that session and returns its existing tier (`member` or `listener`), role, and a fresh WebSocket token. It does not overwrite the existing cookie. This preserves member/host authority across page refreshes, reopened tabs, and temporary socket drops.

```json
{
  "roomPassword": "optional-if-room-protected"
}
```

Listen response:

```json
{
  "session": {
    "roomSessionId": "uuid",
    "accessTier": "listener | member",
    "role": "listener | participant | moderator | host"
  },
  "websocketToken": "signed-websocket-token"
}
```

`POST /api/rooms/:roomId/join` establishes or upgrades to a `member` session. It requires a protected nickname: the caller either authenticates an existing one (`nicknamePassword` against an existing claim) or claims a new one (`newNicknamePassword` + `confirmPassword`) in a single protect-and-join step. If an existing Listener session is supplied, it is upgraded in place rather than duplicated.

```json
{
  "displayNickname": "DJ Fredo",
  "nicknamePassword": "required-if-nickname-already-protected",
  "newNicknamePassword": "required-if-claiming-a-new-nickname",
  "confirmPassword": "required-if-claiming-a-new-nickname",
  "roomPassword": "optional-if-room-protected",
  "listenerSessionId": "optional-uuid-to-upgrade-in-place"
}
```

Join response:

```json
{
  "session": {
    "roomSessionId": "uuid",
    "accessTier": "member",
    "displayNickname": "DJ Fredo",
    "role": "participant",
    "protectedNickname": true
  },
  "websocketToken": "signed-member-token"
}
```

If the caller attempts to `join` without supplying a way to obtain a protected nickname, the server responds `409 NICKNAME_PROTECTION_REQUIRED`. Interactive REST and WebSocket actions performed on a `listener`-tier session are rejected with `403 LISTENER_READ_ONLY` (see Section 23.4).

#### Queue Endpoints

```http
POST /api/rooms/:roomId/queue/items
DELETE /api/rooms/:roomId/queue/items/:queueItemId
POST /api/rooms/:roomId/queue/items/:queueItemId/vote
POST /api/rooms/:roomId/queue/items/:queueItemId/approve
POST /api/rooms/:roomId/queue/items/:queueItemId/reject
POST /api/rooms/:roomId/playback/skip
POST /api/rooms/:roomId/playback/skip-vote
```

`POST /api/rooms/:roomId/queue/items` request:

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=..."
}
```

Response:

```json
{
  "queueItem": {
    "id": "uuid",
    "status": "queued",
    "track": {
      "provider": "youtube",
      "videoId": "abc123",
      "title": "Example Song",
      "channelTitle": "Example Channel",
      "durationSeconds": 213
    }
  }
}
```

#### Chat Endpoints

Most chat should flow through WebSocket. REST may be used for history.

```http
GET /api/rooms/:roomId/chat/messages?before=:cursor
DELETE /api/rooms/:roomId/chat/messages/:messageId
```

#### Moderation Endpoints

```http
POST /api/rooms/:roomId/moderation/mute
POST /api/rooms/:roomId/moderation/unmute
POST /api/rooms/:roomId/moderation/ban
POST /api/rooms/:roomId/moderation/unban
POST /api/rooms/:roomId/moderation/assign-moderator
POST /api/rooms/:roomId/moderation/revoke-moderator
```

#### External Site Integration Endpoints

These are conceptual API endpoints for v1.1 planning. Exact route names may vary, but the API must preserve the same authority boundaries.

```http
POST /api/rooms/:roomId/integrations/site
PATCH /api/rooms/:roomId/integrations/site/:integrationId
DELETE /api/rooms/:roomId/integrations/site/:integrationId
POST /api/integrations/site-command
GET /api/embed/rooms/:roomSlug
GET /api/embed/rooms/:roomSlug/snapshot
```

`POST /api/integrations/site-command` request guidance:

```json
{
  "integrationId": "uuid",
  "roomId": "uuid",
  "channelId": "cool-ws-main",
  "externalMessageId": "msg-123",
  "externalUserId": "user-456",
  "displayName": "alice",
  "roles": ["member"],
  "rawText": "!sr https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "timestamp": "2026-06-06T12:00:00.000Z",
  "idempotencyKey": "cool-ws-main:msg-123"
}
```

Response guidance:

```json
{
  "status": "accepted",
  "resultCode": "SONG_QUEUED",
  "message": "Queued [K7Q] \"Song Title\" - requested by @alice. Position: 4.",
  "externalReference": "K7Q"
}
```

Integration management endpoints must be host/staff authorized through native Trackstacc authority. Command ingestion must be authenticated with the integration's server-side credential, not a browser embed token.

---

## 16. WebSocket Event Design

### 16.1 Connection

Client connects with token after joining room:

```text
wss://app.example.com/ws?roomId=:roomId&token=:websocketToken
```

Server validates:

1. Token signature.
2. Room ID.
3. Session status.
4. Ban/mute status.
5. Expiration.

#### 16.1.1 Reconnection Backoff Specification

When a WebSocket connection drops (network failure, server restart, intermediary timeout), the client must attempt reconnection using exponential backoff with jitter to avoid thundering-herd effects.

| Parameter | Value |
| --------- | ----- |
| Initial delay | 1 second |
| Backoff multiplier | 2x |
| Jitter | ±25% randomized per attempt |
| Maximum delay | 30 seconds |
| Maximum retries before connection-lost state | 10 |
| Heartbeat interval | 25 seconds (client sends `presence.heartbeat`) |
| Server heartbeat timeout | 60 seconds (server marks participant offline) |

Reconnection behavior by phase:

1. **Reconnecting (attempts 1–5):** Client shows a subtle "Reconnecting…" indicator. Chat, queue, and playback UI remain visible but inputs are disabled. The client continues displaying the last-known room state.
2. **Degraded (attempts 6–10):** Client shows "Connection lost. Retrying…" with a visible countdown to the next attempt. Inputs remain disabled.
3. **Disconnected (after 10 failed attempts):** Client shows "Connection lost. Click to reconnect." and stops automatic retries. The user can manually trigger a reconnection attempt, which resets the backoff counter.

On successful reconnection:

1. Client sends the existing WebSocket token.
2. If the token has expired or is invalid, the client requests a new token via the room bootstrap path `POST /api/rooms/:roomId/listen` (which rehydrates the existing cookie-backed session and returns a fresh WebSocket token) and reconnects with the fresh token. If client-side token verification fails during connection or receives a connection error (`WEBSOCKET_TOKEN_INVALID`), the client clears stale stored tokens and falls back to this bootstrap rehydration path.
3. Server sends a full `room.snapshot` event containing current room state, playback, queue, participants, recent messages, and any active veto window.
4. Client reconciles the snapshot with its local state and resumes normal operation.
5. If the participant's session has been invalidated (ban, room deletion, session expiry beyond refresh window), the server sends an `error` event with code `SESSION_INVALID` and the client redirects to the room join flow.

### 16.2 Client-to-Server Events

| Event                  | Purpose                         | Minimum native tier |
| ---------------------- | ------------------------------- | ------------------- |
| `chat.send`            | Send chat message.              | `member`            |
| `queue.add`            | Add YouTube track.              | `member`            |
| `queue.vote`           | Vote on queue item.             | `member`            |
| `playback.skipVote`    | Vote to skip current track.     | `member`            |
| `playback.clientState` | Report local player state.      | `listener`          |
| `presence.heartbeat`   | Maintain presence.              | `listener`          |
| `room.settings.update` | Host/mod setting update.        | `member` (host/mod) |
| `room.mechanic.change` | Host changes playlist mechanic. | `member` (host)     |
| `moderation.action`    | Host/mod action.                | `member` (host/mod) |

**`presence.heartbeat` Event Details:**
- Emitted by the client every 25 seconds when the connection is active.
- Emitting a heartbeat updates `lastSeenAt` in the database and updates the presence key in Redis.
- Heartbeats trigger a sweep of inactive sessions (older than 60 seconds) in Redis and PostgreSQL, followed by a broadcast of `presence.updated` to the room.

Listener-tier sessions may connect to receive read-only state (Section 16.3) and may emit `playback.clientState` and `presence.heartbeat` only. Any `member`-only event received on a `listener`-tier connection is rejected with an `error` acknowledgement carrying code `LISTENER_READ_ONLY`; the server never trusts a client-supplied tier and re-derives it from the signed session token on every event (NFR-038).

### 16.3 Server-to-Client Events

| Event                   | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `room.snapshot`         | Full room state after connect/reconnect. |
| `presence.updated`      | Participant list changed.                |

**`room.snapshot` and `presence.updated` Convergence Behavior:**
- On initial connection or successful reconnection, the server sends a `room.snapshot` event containing the full, authoritative list of active participants.
- Whenever a participant joins, disconnects, or is swept due to a heartbeat timeout, the server broadcasts a `presence.updated` event containing the latest active participant list.
- Clients treat these server events as the authoritative source of truth, completely replacing local participant arrays to ensure convergence and prevent duplicate participant rows.
| `chat.message`          | New chat/system message.                 |
| `chat.deleted`          | Message deleted.                         |
| `queue.updated`         | Queue changed.                           |
| `queue.item.added`      | Track added.                             |
| `queue.item.removed`    | Track removed.                           |
| `queue.vote.updated`    | Vote count changed.                      |
| `queue.item.veto_window.opened` | Pre-play veto window opened for candidate. |
| `queue.item.veto_window.updated` | Pre-play veto counts or window state changed. |
| `queue.item.vetoed`     | Candidate was vetoed before playback.    |
| `queue.item.veto_passed` | Candidate passed veto and will play.     |
| `playback.state`        | Current playback state.                  |
| `playback.resync`       | Client should seek/resync.               |
| `room.settings.changed` | Settings changed.                        |
| `room.mechanic.changed` | Playlist mechanic changed.               |
| `room.external_settings.changed` | External integration/embed/music settings changed. |
| `integration.command.received` | External command was received.       |
| `integration.command.accepted` | External command was accepted.       |
| `integration.command.rejected` | External command was rejected.       |
| `external.bot_message.created` | Outbound bot message was created.    |
| `moderation.applied`    | Mute/ban/delete/etc.                     |
| `error`                 | Action rejected or failed.               |

### 16.4 Example Event: Mechanic Changed

```json
{
  "type": "room.mechanic.changed",
  "roomId": "uuid",
  "actor": {
    "displayNickname": "Fredo",
    "role": "host"
  },
  "oldMechanic": "fifo",
  "newMechanic": "voting",
  "queueTransitionPolicy": "preserve_existing_order",
  "currentTrackUnaffected": true,
  "createdAt": "2026-05-31T20:00:00Z"
}
```

### 16.5 Example Event: Playback State

```json
{
  "type": "playback.state",
  "roomId": "uuid",
  "status": "playing",
  "serverTime": "2026-05-31T20:10:30.000Z",
  "currentItem": {
    "queueItemId": "uuid",
    "videoId": "abc123",
    "title": "Example Song",
    "durationSeconds": 213
  },
  "startedAt": "2026-05-31T20:09:00.000Z",
  "positionSeconds": 90
}
```

---

## 17. Queue Selection Algorithms

### 17.1 FIFO Selection

```text
Select earliest queue item where status = queued ordered by position ASC, created_at ASC.
```

### 17.2 Voting Selection

```text
Select queued item ordered by:
1. score DESC
2. created_at ASC
3. added_by_recent_play_count ASC
4. random tie-breaker if still tied
```

Optional score formula:

```text
score = upvotes - downvotes
```

Optional anti-domination penalty:

```text
effective_score = score - recent_tracks_by_same_user_penalty
```

### 17.3 DJ Rotation Selection

```text
1. Get active rotation participants ordered by rotation_position.
2. Find next participant who:
   - is online or recently active
   - is not muted/banned
   - has submitted a valid pending track
3. Promote that participant's pending track to playing.
4. Move participant to end of rotation.
5. If no eligible participant has a track, fall back to queue or wait state.
```

### 17.4 Host-Curated Selection

```text
Select queue items added or approved by host/mods only, ordered by manual position.
```

### 17.5 Suggestion Approval Selection

```text
Suggestions do not enter active queue until approved.
Approved items then follow FIFO, voting, or host-curated ordering depending on room settings.
```

### 17.6 Pre-Play Veto Advance Cycle

```text
1. Select next candidate using active playlist mechanic.
2. If veto disabled, play candidate.
3. If no alternate playable candidate exists, play candidate.
4. Open veto window for candidate.
5. Accept eligible !yay/!nay votes until threshold reached or window closes.
6. If netNays reaches vetoThreshold, mark candidate vetoed and select next eligible candidate.
7. Do not reselect a vetoed candidate in the same advance cycle.
8. If alternatives are exhausted, play last candidate without veto or stop gracefully according to room setting.
9. If window closes without veto, play candidate.
```

Pre-play veto is an additional gate after normal queue selection. It does not replace FIFO, voting queue, DJ rotation, host-curated, or suggestion approval mechanics.

---

## 18. Playback Synchronization Design

### 18.1 Server Time Model

The server records:

1. `started_at`
2. `paused_at`, if pause support is enabled
3. `accumulated_pause_seconds`, if pause support is enabled
4. Current queue item
5. Current playback status

Client computes target seek position:

```text
target_position = server_now - started_at - accumulated_pause_seconds
```

### 18.2 Client Resync

Client should resync when:

1. Joining a room.
2. Reconnecting WebSocket.
3. Receiving `playback.resync`.
4. Local player position differs from server-estimated position by more than tolerance.
5. Current video ID differs from server state.

Suggested MVP tolerance:

```text
if abs(local_position - server_position) > 3 seconds:
    seekTo(server_position)
```

### 18.3 Autoplay Limitations

Because browsers may block autoplay, clients should:

1. Show a **Click to Join Playback** button when necessary.
2. Join chat/queue even if player is awaiting user gesture.
3. Resync once playback is allowed.
4. Avoid assuming all clients are actively playing.

---

## 19. Security Design

### 19.1 Threat Model

Key risks:

1. Nickname impersonation.
2. Protected nickname brute force.
3. Room host secret leakage.
4. Chat spam.
5. Queue spam.
6. XSS through chat, nickname, room name, or video metadata.
7. Unauthorized moderator/host actions.
8. WebSocket event forgery.
9. Abuse via public rooms.
10. API key exposure.
11. Forged external chat commands.
12. Replay or duplicate external message delivery.
13. External role spoofing.
14. Vote manipulation through unstable or browser-provided identity.
15. Secret leakage through iframe URLs or browser JavaScript.
16. Listener-tier privilege escalation (a read-only user attempting interactive actions by manipulating the client or forging a tier claim).

### 19.2 Mitigations

| Risk                   | Mitigation                                                           |
| ---------------------- | -------------------------------------------------------------------- |
| Nickname impersonation | Protected nickname password; room-level active nickname uniqueness.  |
| Password brute force   | Rate limits by nickname, IP/session, and global risk score.          |
| Weak passwords         | Minimum password length and strength checks.                         |
| Host secret leakage    | Store only hash; allow host secret rotation in Phase 2.              |
| Chat spam              | Rate limits, slow mode, mutes, bans.                                 |
| Queue spam             | Per-user queue limits, duplicate rules, add-song cooldown.           |
| XSS                    | Escape all user content; sanitize markdown if added; strict CSP.     |
| Unauthorized actions   | Server-side role checks for every write.                             |
| Event forgery          | Signed WebSocket token and server-side validation.                   |
| API key exposure       | YouTube API key only server-side for metadata/search where possible. |
| Forged external commands | HMAC signature or bearer token verification, timestamp freshness, and replay protection. |
| Duplicate external commands | Idempotency by integration/channel/message ID.                    |
| External role spoofing | Trusted role mappings configured per integration; no client-side trust. |
| Vote manipulation      | One vote per stable external user ID per candidate; no anonymous embed votes by default. |
| Secret leakage         | Public embed token distinct from server-side integration secret; no secrets in browser payloads. |
| Listener privilege escalation | Native access tier is encoded in the signed session token and re-derived server-side on every REST request and WebSocket event; interactive actions on a `listener` session are rejected (`LISTENER_READ_ONLY` / `NICKNAME_PROTECTION_REQUIRED`) regardless of client state (NFR-038, FR-028). |

### 19.3 Password Storage

Use Argon2id with strong parameters.

Stored value:

```text
argon2id_hash(password, random_salt, memory_cost, time_cost, parallelism)
```

Never store plaintext passwords. Never log passwords. Never return password hashes to clients.

### 19.4 Session Tokens

Recommended:

1. Use secure, httpOnly, SameSite cookies for browser sessions.
2. Use short-lived signed WebSocket tokens.
3. Rotate tokens on privilege escalation, such as becoming host/mod.
4. Store token hashes server-side if revocation is required.

> **Implementation note:** The `WsTokenPayload` interface in `apps/api/src/lib/tokens.ts` includes an optional `accessTier` field for encoding listener/member tier in signed WS tokens. Existing tokens without this field still verify successfully. When the field is absent, the system falls back to a database lookup for tier determination. Session tokens are signed using `SESSION_SECRET` from config.

### 19.5 External Integration Security

**This section is the single authoritative source for external integration security requirements.** Sections 12.4 (Authority Constraints), 13.11 (External Command Service), 20.3 (External Integration Abuse Controls), 31.7 (External Site Integration acceptance criteria), and 31.9 (External Staff Commands acceptance criteria) reference this section rather than restating these constraints independently. If a conflict exists between this section and a downstream reference, this section takes precedence.

External command ingestion and outbound bot delivery must use defense-in-depth:

1. HMAC signature or bearer token verification for inbound commands.
2. Timestamp freshness window.
3. Idempotency by external message ID.
4. Replay protection.
5. Strict schema validation before parsing commands.
6. Per-integration, per-room, per-user, and per-command rate limits.
7. Sanitization of raw text, display names, titles, outbound bot messages, and references.
8. Audit log for accepted and rejected privileged commands.
9. Signed outbound bot webhooks.
10. Public embed token distinct from server-side integration secret.
11. Allowed origin/domain allowlist for embeds.
12. CSP `frame-ancestors` guidance for registered embed origins.
13. No privileged mutation endpoints callable from the embed without authenticated server-side identity.

### 19.6 CORS and CSP Policy

CORS and CSP are mandatory security controls for native pages, API routes, WebSocket connections, and embeddable room pages. The default stance is deny-by-default with explicit allowlists per environment and per external integration.

#### 19.6.1 Origin Model

| Surface | Allowed origins | Credentials | Notes |
| ------- | --------------- | ----------- | ----- |
| Native web app pages | First-party Trackstacc origins only. Local development may allow `http://localhost:3000`. | N/A | Native pages should not be frameable by arbitrary third-party sites. |
| Public REST API used by native web app | First-party web app origins from `APP_ORIGINS` / `CORS_ORIGINS`. | Yes, only for first-party origins. | `Access-Control-Allow-Origin: *` must never be used with credentials. |
| Socket.IO gateway | Same allowlist as REST API, plus explicit development origins. | Yes, only for first-party origins. | Validate both HTTP polling and WebSocket upgrade origins. |
| Read-only embed pages | Per-integration registered `allowed_origins`. | No Trackstacc session cookies by default. | Embed access is display-only unless a future authenticated identity bridge is introduced. |
| External command endpoint | Server-to-server only. Browser CORS is not a trust boundary and should be disabled or limited to first-party admin tooling. | No browser credentials. | Authentication is HMAC or bearer credential plus timestamp/replay/idempotency checks. |
| Outbound bot webhook | Egress from Trackstacc to configured webhook URL. | N/A | Webhook target validation and signing are covered by Section 19.5. |

#### 19.6.2 Required CORS Behavior

1. Maintain separate allowlists for first-party web origins and external embed origins.
2. Reject API and Socket.IO browser requests whose `Origin` is absent or not allowlisted, except explicitly documented same-origin server-to-server health checks.
3. Return `Vary: Origin` on CORS-enabled responses.
4. Allow credentials only for first-party Trackstacc origins that need httpOnly session cookies.
5. Do not allow credentials for third-party embed origins in MVP.
6. Keep allowed methods minimal: `GET`, `POST`, `PATCH`, `DELETE`, and `OPTIONS` only where implemented.
7. Keep allowed headers minimal: `Content-Type`, `Authorization`, `X-Request-Id`, `X-Idempotency-Key`, `X-Trackstacc-Timestamp`, and `X-Trackstacc-Signature`.
8. Set `Access-Control-Max-Age` to a bounded value, recommended 600 seconds.
9. Log rejected origins with request ID, route, and environment, but never log bearer tokens, HMAC secrets, cookies, or full signatures.

#### 19.6.3 Native Page CSP

Native Trackstacc pages should use a strict CSP. A representative production policy is:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'self';
form-action 'self';
img-src 'self' data: https://i.ytimg.com;
media-src 'none';
script-src 'self' 'nonce-{request_nonce}' https://www.youtube.com https://www.gstatic.com;
style-src 'self' 'nonce-{request_nonce}';
frame-src https://www.youtube.com https://www.youtube-nocookie.com;
connect-src 'self' https://api.trackstacc.live wss://api.trackstacc.live;
font-src 'self' data:;
upgrade-insecure-requests;
report-to csp-endpoint;
```

If a framework or third-party component temporarily requires inline styles, the exception must be documented and removed before production sign-off. Avoid `unsafe-inline` and `unsafe-eval` in production script policy.

#### 19.6.4 Embed Page CSP

Read-only embed pages require a dynamic per-integration CSP because `frame-ancestors` must match the integration's registered origins.

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors {integration_allowed_origins};
form-action 'none';
img-src 'self' data: https://i.ytimg.com;
script-src 'self' 'nonce-{request_nonce}' https://www.youtube.com https://www.gstatic.com;
style-src 'self' 'nonce-{request_nonce}';
frame-src https://www.youtube.com https://www.youtube-nocookie.com;
connect-src 'self' https://api.trackstacc.live wss://api.trackstacc.live;
font-src 'self' data:;
upgrade-insecure-requests;
report-to csp-endpoint;
```

Embed pages must not include integration secrets, host secrets, room passwords, session IDs, or staff role assertions in iframe URLs, JavaScript, localStorage, sessionStorage, postMessage payloads, or public room snapshots.

#### 19.6.5 Frame and Header Policy

1. Use `frame-ancestors 'self'` or a stricter value for native pages.
2. Use dynamic `frame-ancestors` for embed pages based on registered external origins.
3. Do not send `X-Frame-Options: DENY` or `SAMEORIGIN` on embed pages because it conflicts with legitimate framing. Native pages may use `SAMEORIGIN` if compatible with CSP.
4. Set `Referrer-Policy: strict-origin-when-cross-origin`.
5. Set `Permissions-Policy` to disable unnecessary browser capabilities by default, including camera, microphone, geolocation, payment, and USB.
6. Set `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` conservatively for native pages; validate compatibility before enabling on embed pages.
7. Run CSP in report-only mode in staging, enforce in production, and monitor violations by route, integration, and origin.

---

## 20. Abuse Prevention and Moderation Policy

### 20.1 Abuse Scenarios

1. User floods chat.
2. User adds extremely long videos.
3. User repeatedly adds offensive videos.
4. User impersonates another nickname.
5. User joins with offensive nickname.
6. User rapidly creates rooms.
7. User repeatedly changes playlist mechanic if given permissions.
8. User uses multiple sessions to manipulate votes.
9. External site sends forged, replayed, or duplicate music commands.
10. External user floods `!sr` commands or stacks the queue.
11. External users coordinate veto abuse against every candidate.
12. External staff role is spoofed or over-trusted.
13. Embed origin is copied to an unregistered domain.
14. Outbound bot webhook fails or is abused for message injection.

### 20.2 Controls

1. Mandatory protected nickname before any native interactive participation (chat, vote, add, react), raising the per-actor cost of chat/queue/vote abuse while keeping listening free.
2. Nickname protection with password strength checks and per-nickname/IP brute-force rate limits.
3. Chat rate limits.
4. Queue add rate limits.
5. Max video duration.
6. Duplicate prevention.
7. Vote limits per room session.
8. Host/mod tools.
9. Public-room cooldowns.
10. Audit logs.
11. Optional public-room report feature in Phase 2.

### 20.3 External Integration Abuse Controls

The external integration security architecture is specified authoritatively in Section 19.5. The controls below detail the abuse-specific layering that builds on those security foundations.

#### Command Bridge Controls

1. HMAC signature or bearer token verification for inbound commands.
2. Timestamp freshness window.
3. Idempotency by external message ID.
4. Replay protection.
5. Per-integration rate limits.
6. Per-room rate limits.
7. Per-user rate limits.
8. Per-command rate limits.
9. Strict schema validation.
10. Sanitization of raw text, display names, titles, outbound bot messages, and references.
11. Audit log for accepted and rejected privileged commands.
12. Webhook retry policy for outbound bot messages.
13. Outbound bot webhooks must be signed.

#### Queue Abuse Controls

1. `maxQueueSize`.
2. `maxPendingPerUser`.
3. `maxAddsPerUserPerHour`.
4. `maxAddsPerRoomPerMinute`.
5. `maxDurationSeconds`.
6. Duplicate policies.
7. Blocked video IDs.
8. Blocked channel IDs.
9. Graceful handling of unavailable, private, deleted, age-restricted, or unembeddable videos.
10. Optional quarantine/manual approval for suspicious submissions.

#### Vote Abuse Controls

1. One vote per external user per candidate.
2. Vote changes replace previous vote.
3. No anonymous embed votes by default.
4. Minimum eligibility rules, such as active chatter, active listener, or recent user.
5. Optional account-age/trust signal fields from the embedding site.
6. Requester vote policy documented or configurable.
7. Voter identity must come from the integration backend, not browser input.

#### Staff Abuse Controls

1. Staff allowlist by external user ID.
2. Trusted role mapping configured per integration.
3. Staff command rate limits.
4. Audit log every staff command.
5. Bot/system announcement for staff actions.
6. No client-side trust in staff role.
7. Settings changes should be reversible or clearly announced.
8. Mute/unmute actions are rate-limited per staff user and per target.
9. Permanent mutes require explicit confirmation or a dedicated syntax to avoid accidental lifetime bans.
10. Auto-expiry of timed mutes is checked lazily on the muted participant's next command attempt, ensuring no timer infrastructure is needed.

#### Embed Abuse Controls

1. Allowed origin/domain allowlist.
2. CSP `frame-ancestors` guidance for registered embed origins.
3. Public embed token distinct from server-side integration secret.
4. No secrets in browser JavaScript.
5. No privileged mutation endpoints callable from embed without authenticated server-side identity.

---

## 21. Privacy Design

### 21.1 Data Collected

MVP may collect:

1. Nicknames.
2. Protected nickname password hashes.
3. Room sessions.
4. Chat messages.
5. Queue entries and votes.
6. Moderation actions.
7. IP-derived rate-limit signals, stored minimally and preferably hashed.
8. Basic logs for security, debugging, and abuse prevention.
9. External user IDs, display names, command records, vote records, and staff command audit metadata needed for external integrations.

Listener sessions (native users without a protected nickname) hold no nickname and no password hash; they generate only a minimal read-only session plus the rate-limit and log signals above. A protected nickname password hash is collected only when a user chooses to participate.

### 21.2 Data Not Collected in MVP

1. Email addresses.
2. Real names.
3. OAuth identities.
4. Payment information.
5. Uploaded audio files.
6. YouTube account credentials.
7. Integration secrets in public payloads, iframe URLs, browser JavaScript, or client storage.
8. Raw external site session IDs unless explicitly needed, disclosed, and protected.

External user IDs should be treated as pseudonymous identifiers. Trackstacc should store the minimum external identity data needed for voting, rate limiting, moderation, and audit. Public payloads must not expose integration secrets, raw IP addresses, session IDs, or password metadata.

### 21.3 Retention

Recommended defaults:

| Data                             | Retention                                                   |
| -------------------------------- | ----------------------------------------------------------- |
| Temporary inactive rooms         | Delete after 7-30 days of inactivity.                       |
| Chat messages in temporary rooms | Delete with room.                                           |
| Protected nickname claims        | Retain until released or inactive expiration policy.        |
| Rate-limit logs                  | 7-30 days.                                                  |
| Audit logs                       | 30-180 days depending on moderation needs.                  |
| Track metadata cache             | Refresh periodically according to policy and product needs. |
| External command records         | 30-180 days depending on moderation and abuse needs.        |
| External participant mappings    | Retain while integration/room remains active or according to inactivity policy. |

Terms/privacy disclosures should explain external site integrations, pseudonymous external user IDs, bot webhooks, and YouTube embed/API usage.

---

## 22. YouTube Integration Design

### 22.1 Playback

Use YouTube embedded player functionality for playback. The application should not download, proxy, extract, or re-stream audio/video content.

External embeds must preserve the same compliance boundary. YouTube playback remains through official embedded player behavior; Trackstacc does not download, proxy, extract, cache, or re-stream audiovisual content for embedding sites.

Client responsibilities:

1. Load YouTube IFrame player.
2. Load current video by video ID.
3. Seek to server-provided position.
4. Listen for player state changes.
5. Report ended/error states to server.

Server responsibilities:

1. Decide what should be playing.
2. Broadcast current video ID and timing state.
3. Handle end/skip/failed transitions.

### 22.2 Metadata

Use YouTube metadata APIs where needed to retrieve:

1. Title.
2. Channel name.
3. Duration.
4. Thumbnail.
5. Embeddability or availability where available.

Metadata caching is important because search and metadata calls may be quota-limited.

### 22.3 Search

MVP should prioritize URL paste over in-app search. In-app search should be added only after quota budgeting, caching, and abuse controls are designed.

### 22.4 Compliance Checklist

Before production launch:

1. Review current YouTube API Services Terms.
2. Review current YouTube Developer Policies.
3. Review branding guidelines.
4. Add required terms and privacy disclosures.
5. Display required links to YouTube terms where applicable.
6. State that users are also bound by YouTube terms when using embedded/API-powered features, where required.
7. Ensure app privacy policy discloses use of YouTube API Services and Google privacy policy references where required.
8. Do not obscure YouTube branding or player controls in prohibited ways.
9. Do not cache API data beyond allowed policy constraints.
10. Monitor quota usage and API errors.

---

## 23. Error Handling and Resilience

### 23.1 Error Handling Principles

1. Every REST error, WebSocket command error, and external command rejection must use a stable error code from the registry in Section 23.4.
2. Error codes are machine-readable and stable. User-facing messages may be revised for clarity without changing the code.
3. Do not leak internal stack traces, SQL details, dependency credentials, HMAC material, room secrets, session tokens, password metadata, or raw signed payloads.
4. Include a request/correlation ID in every REST response, WebSocket error acknowledgement, external command result, structured log, and audit entry.
5. Prefer explicit recoverable errors over generic failures. Use `INTERNAL_ERROR` only when no safer, more specific code applies.
6. Rate-limit and dependency errors must include retry guidance where it is safe to do so.
7. Privileged command failures should be audit-logged without exposing sensitive implementation details to the external chat.

### 23.2 Transport Error Envelopes

#### 23.2.1 REST API Error Envelope

```json
{
  "error": {
    "code": "VIDEO_TOO_LONG",
    "message": "This video is longer than the room limit.",
    "requestId": "req_01J...",
    "retryable": false,
    "retryAfterSeconds": null,
    "details": {
      "maxDurationSeconds": 600
    }
  }
}
```

REST responses must set the corresponding HTTP status from Section 23.4. `429` responses must include `Retry-After` when a retry time is known. `503` responses should include `Retry-After` only when the service can make a bounded recovery estimate.

> **Implementation note:** The `ErrorResponse` type matching this envelope is defined in `packages/types/src/api.ts`. The `AppError` class and `toErrorResponse()` helper are in `apps/api/src/lib/errors.ts`. The error handler in `apps/api/src/main.ts` includes `requestId` from `request.id` in all error responses.

#### 23.2.2 WebSocket Error Acknowledgement

Client-to-server Socket.IO events that can fail must acknowledge with the same registry code:

```json
{
  "ok": false,
  "sourceEvent": "queue.item.add",
  "code": "QUEUE_LOCKED",
  "message": "The host has locked song additions.",
  "requestId": "req_01J...",
  "retryable": false,
  "retryAfterSeconds": null,
  "details": {}
}
```

Unsolicited server-side errors should use `error` or a domain-specific failure event with the same fields. WebSocket errors must not disconnect the client unless the error is authentication, authorization, protocol abuse, or unrecoverable server degradation.

> **Implementation note:** The `WsErrorAcknowledgement` type is defined in `packages/types/src/events.ts`. The `toWsErrorAcknowledgement()` helper in `apps/api/src/lib/errors.ts` constructs the error envelope with `requestId` (from `generateEventRequestId()` in `apps/api/src/realtime/request-id.ts`) and `sourceEvent`. The Socket.IO `onAny` handler in `apps/api/src/realtime/room.gateway.ts` catches errors and sends them via `socket.emit("error", ...)` with this envelope.

#### 23.2.3 External Command Result Envelope

External command responses and outbound bot webhook payloads must preserve the same code taxonomy:

```json
{
  "ok": false,
  "resultCode": "EXTERNAL_USER_MUTED",
  "userMessage": "@alice is muted from song requests and veto voting.",
  "requestId": "req_01J...",
  "idempotencyStatus": "processed",
  "retryable": false,
  "retryAfterSeconds": null
}
```

Accepted duplicate external commands must return the original result where available and set `idempotencyStatus` to `duplicate_replayed`. Duplicate handling must not create a second queue item, vote, setting change, or moderation action.

### 23.3 HTTP Status and Retry Conventions

| Status | Meaning | Retry guidance |
| ------ | ------- | -------------- |
| `400` | Invalid request shape, invalid command syntax, invalid URL, invalid enum, or failed validation. | Do not retry without changing input. |
| `401` | Missing, expired, invalid, or unauthenticated session/integration credential. | Retry only after re-authentication or credential rotation. |
| `403` | Authenticated actor lacks permission or is blocked by moderation/policy. | Do not automatically retry. |
| `404` | Room, queue item, track, message, participant, or integration was not found or not visible to actor. | Do not automatically retry. |
| `409` | State conflict, duplicate request, nickname taken, mechanic transition conflict, or idempotency collision. | Retry only after refreshing state or using a new idempotency key where appropriate. |
| `422` | Semantically valid request shape but impossible domain action, such as no veto window or no alternate candidate. | Do not retry without state change. |
| `429` | Rate-limited by user, room, integration, IP/session, command, or global abuse control. | Retry after `Retry-After` or after the returned cooldown. |
| `503` | Dependency unavailable, circuit breaker open, degraded mode preventing requested write, or maintenance. | Retry after backoff if `retryable=true`. |
| `500` | Unexpected server error. | Retry with backoff only for idempotent reads or idempotent writes. |

### 23.4 Formal Error Code Registry

> **Implementation note:** The error code registry is implemented in `apps/api/src/lib/error-codes.ts` (`ERROR_REGISTRY` + `getErrorDefinition()`). When adding a new error code, add it to both this table and the `ERROR_REGISTRY` in that file.

| Code | HTTP | Applies to | User-facing message direction | Retry guidance |
| ---- | ---- | ---------- | ----------------------------- | -------------- |
| `VALIDATION_FAILED` | 400 | REST, WebSocket, external command | "Some fields are missing or invalid." | Correct input before retrying. |
| `INVALID_COMMAND_SYNTAX` | 400 | External command | "That music command was not understood. Try `!help music`." | Correct command before retrying. |
| `AUTH_REQUIRED` | 401 | REST, WebSocket | "Please join the room again." | Rejoin or refresh session. |
| `SESSION_INVALID` | 401 | REST, WebSocket | "Your room session expired. Please rejoin." | Rejoin room. |
| `WEBSOCKET_TOKEN_INVALID` | 401 | WebSocket | "Realtime connection could not be authenticated." | Refresh session and reconnect. |
| `INTEGRATION_AUTH_INVALID` | 401 | External command | "Music command integration is not authenticated." | Rotate or fix integration credential; do not expose detail to chat. |
| `FORBIDDEN` | 403 | REST, WebSocket, external command | "You are not allowed to do that." | Do not retry unless permissions change. |
| `HOST_REQUIRED` | 403 | REST, WebSocket, external command | "Only the host can do that." | Do not retry unless actor becomes host. |
| `MODERATOR_REQUIRED` | 403 | REST, WebSocket, external command | "Only a host or moderator can do that." | Do not retry unless role changes. |
| `EXTERNAL_COMMAND_UNAUTHORIZED` | 403 | External command | "That music command is not available to you." | Do not retry unless staff mapping changes. |
| `EXTERNAL_ROLE_UNTRUSTED` | 403 | External command | "That staff role could not be verified." | Fix integration role mapping before retrying. |
| `MUTED` | 403 | REST, WebSocket | "You are muted in this room." | Do not retry until unmuted or mute expires. |
| `BANNED` | 403 | REST, WebSocket | "You cannot participate in this room." | Do not retry. |
| `EXTERNAL_USER_MUTED` | 403 | External command | "You are muted from song requests and veto voting." | Do not retry until unmuted or mute expires. |
| `ROOM_NOT_FOUND` | 404 | REST, WebSocket, external command | "Room not found." | Check room link or integration room ID. |
| `QUEUE_ITEM_NOT_FOUND` | 404 | REST, WebSocket, external command | "That queue item was not found." | Refresh queue or use a valid reference. |
| `TRACK_NOT_FOUND` | 404 | REST, WebSocket | "That track was not found." | Refresh state before retrying. |
| `CHAT_MESSAGE_NOT_FOUND` | 404 | REST, WebSocket | "That chat message was not found." | Refresh chat before retrying. |
| `EXTERNAL_INTEGRATION_NOT_FOUND` | 404 | External command | "Music integration was not found." | Fix integration ID/configuration. |
| `NICKNAME_REQUIRED` | 409 | REST, WebSocket | "Choose a nickname before participating." | Join with nickname. |
| `NICKNAME_PROTECTION_REQUIRED` | 409 | REST, WebSocket | "Set a password for your nickname to chat and take part." | Claim or authenticate a protected nickname, then retry. |
| `LISTENER_READ_ONLY` | 403 | REST, WebSocket | "You're listening as a guest. Get a protected nickname to do that." | Upgrade to a protected nickname (member tier), then retry. |
| `NICKNAME_TAKEN` | 409 | REST | "Someone is already using that nickname in this room." | Choose another nickname. |
| `NICKNAME_PROTECTED` | 409 | REST | "That nickname is protected. Enter its password to use it." | Retry with password. |
| `NICKNAME_PASSWORD_INCORRECT` | 403 | REST | "That nickname is protected. The password was incorrect." | Retry carefully; rate limits apply. |
| `NICKNAME_PASSWORD_RATE_LIMITED` | 429 | REST | "Too many incorrect attempts. Try again later." | Retry after cooldown. |
| `ROOM_PASSWORD_REQUIRED` | 401 | REST | "This room requires a password." | Retry with password. |
| `ROOM_PASSWORD_INCORRECT` | 403 | REST | "Room password was incorrect." | Retry carefully; rate limits apply. |
| `QUEUE_LOCKED` | 403 | REST, WebSocket, external command | "The host has locked song additions." | Retry only after queue unlock. |
| `CHAT_LOCKED` | 403 | REST, WebSocket | "Chat is locked right now." | Retry only after chat unlock. |
| `SONG_REQUEST_POLICY_CLOSED` | 403 | REST, WebSocket, external command | "Song requests are currently closed." | Retry only after policy changes. |
| `SONG_REQUEST_COOLDOWN` | 429 | REST, WebSocket, external command | "You can request another song after the cooldown." | Retry after returned cooldown. |
| `MAX_PENDING_PER_USER_REACHED` | 409 | REST, WebSocket, external command | "Wait until one of your songs resolves before adding another." | Retry after queue state changes. |
| `QUEUE_FULL` | 409 | REST, WebSocket, external command | "The queue is full right now." | Retry after queue shrinks. |
| `VIDEO_URL_INVALID` | 400 | REST, WebSocket, external command | "Enter a valid YouTube video URL." | Correct URL before retrying. |
| `VIDEO_UNAVAILABLE` | 422 | REST, WebSocket, external command | "This video cannot be played here. Try another YouTube link." | Choose another video. |
| `VIDEO_TOO_LONG` | 422 | REST, WebSocket, external command | "This video is longer than the room limit." | Choose shorter video or request host approval. |
| `DUPLICATE_VIDEO` | 409 | REST, WebSocket, external command | "That song is already in the queue." | Choose another video or wait for duplicate window to pass. |
| `YOUTUBE_METADATA_DEGRADED` | 503 | REST, WebSocket, external command | "YouTube metadata is temporarily limited. The song may be queued with partial details." | Retry metadata lookup later; queue write may still succeed when allowed. |
| `VOTE_NOT_ALLOWED` | 403 | REST, WebSocket, external command | "You cannot vote on this item." | Do not retry unless eligibility changes. |
| `NO_VETO_OPEN` | 422 | REST, WebSocket, external command | "No song is currently open for veto voting." | Retry when a veto window opens. |
| `NO_ALTERNATE_FOR_VETO` | 422 | REST, WebSocket, external command | "There is no alternate song in the queue, so veto voting is closed." | Retry after another eligible song is queued. |
| `VETO_WINDOW_CLOSED` | 409 | REST, WebSocket, external command | "Voting for that song has closed." | Wait for next candidate. |
| `MECHANIC_CHANGE_COOLDOWN` | 429 | REST, WebSocket | "Playlist mode was changed recently. Try again later." | Retry after cooldown. |
| `EXTERNAL_COMMAND_REPLAY` | 409 | External command | "That command could not be processed." | Do not retry same signed payload. |
| `EXTERNAL_COMMAND_DUPLICATE` | 409 | External command | "That command was already processed." | Do not create another command; return original result where possible. |
| `RATE_LIMITED` | 429 | REST, WebSocket, external command | "You're doing that too quickly. Try again shortly." | Retry after `Retry-After`. |
| `WEBHOOK_DELIVERY_DEFERRED` | 503 | External command/outbound webhook | "Command accepted, but the chat announcement is delayed." | No user retry needed; system retries webhook. |
| `DEPENDENCY_UNAVAILABLE` | 503 | REST, WebSocket, external command | "A required service is temporarily unavailable." | Retry with backoff if retryable. |
| `SERVICE_DEGRADED` | 503 | REST, WebSocket, external command | "Trackstacc is running in degraded mode. Try again shortly." | Retry with backoff if retryable. |
| `INTERNAL_ERROR` | 500 | REST, WebSocket, external command | "Something went wrong. Try again." | Retry idempotent operations with backoff; report request ID if persistent. |

### 23.5 User-Facing Error Message Requirements

1. User-facing messages must be short, action-oriented, and safe to display in native UI or external chat.
2. External command failures should mention the actor only when the embedding site's display name has already been sanitized.
3. Staff-only failure reasons should not reveal staff allowlists, secret validation details, raw role claims, or moderation identifiers.
4. Dependency failures should distinguish between "request rejected" and "request accepted but announcement delayed."
5. The UI should map `retryAfterSeconds` to countdown text when present.

### 23.6 Circuit Breakers and Graceful Degradation

Trackstacc must treat external dependencies as unreliable and use explicit circuit breakers, timeouts, and degraded-mode behavior. Circuit breaker state should be visible in health/readiness checks, logs, metrics, and alerts.

| Dependency | Timeout target | Open breaker trigger | Open duration | Fallback / degraded behavior | User-visible behavior |
| ---------- | -------------- | -------------------- | ------------- | ---------------------------- | --------------------- |
| YouTube Data API / metadata lookup | 2s connect, 4s total request | 5 failures or timeout rate >50% over 60s | 60s, then half-open probe | Queue by validated video ID with `metadata_status=partial` when room policy allows; defer metadata enrichment to worker; disable in-app search while open. | Song request may succeed with partial title/thumbnail; search shows temporary outage. |
| Redis | 500ms connect, 1s operation | 3 consecutive connection failures or p95 Redis latency >1s for 60s | 30s, then half-open probe | Fail closed for rate-limit-protected writes, external commands, nickname password attempts, and staff actions; allow safe reads from PostgreSQL; fall back to PostgreSQL lastSeenAt index for presence query and cleanup; avoid cross-instance broadcast assumptions. | Writes that require rate limiting or distributed coordination return `SERVICE_DEGRADED`; room may show "realtime degraded." |
| PostgreSQL | 1s connect, 3s query for interactive routes | 3 consecutive failed health probes or pool exhaustion for 30s | 30s, then half-open probe | Readiness fails; durable reads/writes stop; optionally serve cached read-only room snapshot if marked stale and no secrets are exposed. | Most actions return `DEPENDENCY_UNAVAILABLE`; health readiness reports unavailable. |
| Outbound bot webhook endpoint | 2s connect, 5s total request | 5 consecutive delivery failures, repeated 429/5xx, or timeout rate >50% over 5 minutes per integration | 5 minutes, then half-open probe | Do not roll back accepted queue, vote, playback, moderation, or setting changes; enqueue bounded retries with exponential backoff and idempotent delivery IDs; move exhausted deliveries to dead-letter queue. | External command can return success with `WEBHOOK_DELIVERY_DEFERRED` note when only announcement delivery failed. |

#### 23.6.1 Circuit Breaker State Machine

1. **Closed:** dependency is healthy; normal operations allowed.
2. **Open:** dependency is considered unhealthy; protected calls fail fast or use documented fallback.
3. **Half-open:** allow a small number of probe requests. Close breaker after successful probes; reopen on failure.
4. Circuit breaker transitions must emit structured logs and metrics tagged by dependency, operation, room/integration where applicable, and environment.
5. Manual override may force a dependency into maintenance/degraded mode, but the override must be auditable.

#### 23.6.2 Dependency-Specific Degradation Rules

1. **YouTube metadata degradation:** The queue engine may accept a song with only a validated video ID if the URL format is valid, room duration policy can be enforced from cache or deferred policy, and the room does not require complete metadata before acceptance. If max-duration cannot be verified and the room requires strict duration enforcement, reject with `YOUTUBE_METADATA_DEGRADED` rather than accepting an unknown-duration video.
2. **Redis degradation:** Because Redis backs rate limits and realtime coordination, abuse-sensitive writes must fail closed when Redis is unavailable. This includes external song requests, external votes, staff commands, nickname password attempts, room creation bursts, and public-room queue writes. Local in-memory fallback may be used only for development or single-instance emergency operation and must be marked unsafe for horizontal scale.
- **Redis-degraded presence fallback:** When Redis is degraded/unavailable, the Presence Manager falls back to PostgreSQL. It queries active sessions directly using `lastSeenAt >= (now - 60 seconds) AND leftAt IS NULL` and sweeps inactive sessions by updating `leftAt = now` where `lastSeenAt < (now - 60 seconds) and leftAt IS NULL`. This bounds presence approximation to a maximum of 60 seconds and prevents participant list duplication or unbounded growth.
3. **PostgreSQL degradation:** PostgreSQL is the source of truth. Do not accept queue, chat, moderation, playback, nickname, integration, or settings writes unless they can be durably committed. Redis/cache state must not become authoritative.
4. **Webhook degradation:** Webhook failure is non-transactional relative to room state. The command result should distinguish accepted state changes from delayed external announcements.
5. **Readiness:** `/health` may remain alive during degraded mode; `/health/ready` must fail when PostgreSQL is unavailable or when Redis is unavailable for deployments where realtime/rate-limit correctness is required.

---

## 24. Observability

### 24.1 Metrics

Track:

1. Active rooms.
2. Active participants.
3. WebSocket connections.
4. Messages per second.
5. Queue additions per minute.
6. YouTube API quota usage.
7. YouTube metadata failure rate.
8. Playback error rate.
9. Room creation rate.
10. Nickname protection rate.
11. Failed nickname password attempts.
12. Moderation actions.
13. Rate-limit triggers.
14. External command volume.
15. External command rejection rate by result code.
16. Pre-play veto windows opened, passed, and vetoed.
17. Vote volume and rejected vote attempts.
18. Outbound bot webhook failures and retry counts.
19. Integration abuse/rate-limit triggers.
20. External staff command volume and settings changes.
21. External mute/unmute actions and currently active mute counts.
22. Presence degradation triggers (fallback to database).
23. WebSocket disconnect spikes and reconnection rates.

### 24.2 Logs

Use structured logs with:

1. Request ID.
2. Room ID.
3. Session ID hash.
4. Action type.
5. Error code.
6. Latency.
7. User agent class where helpful.
8. Integration ID for external command flows.
9. External user ID hash where needed for abuse investigation.
10. External message ID and idempotency result.
11. Webhook delivery ID and result.
12. Mute/unmute action reason and duration.

Do not log:

1. Plaintext passwords.
2. Full session tokens.
3. Host secrets.
4. Sensitive IP addresses unless required and protected.
5. Integration secrets.
6. Unsanitized external command text if it contains secrets or unsafe content.

### 24.3 Alerts

Alert on:

1. API error rate spikes.
2. WebSocket disconnect spikes.
3. Database latency.
4. Redis unavailability.
5. YouTube API quota exhaustion.
6. High playback failure rate.
7. Sudden room creation spam.
8. High password brute-force signals.
9. External command rejection spikes.
10. Outbound webhook failure spikes.
11. Veto abuse signals, such as repeated veto exhaustion in a public room.
12. Staff command anomalies or excessive settings changes.

---

## 25. Deployment Architecture

### 25.1 MVP Deployment

```text
CDN / Edge
  └─ Next.js frontend

Application Server
  ├─ REST API
  ├─ WebSocket gateway
  └─ Background workers

Managed PostgreSQL
Managed Redis
Monitoring / logging platform
```

For early MVP, REST API and WebSocket gateway may run in the same deployable service. As scale increases, separate WebSocket gateways from API workers.

### 25.2 Scaling Strategy

1. Make API servers stateless.
2. Store durable state in PostgreSQL.
3. Store presence and rate limits in Redis.
4. Use Redis pub/sub or NATS for cross-instance room broadcasts.
5. Use sticky sessions for WebSocket if necessary, but do not rely on in-memory-only room state.
6. Partition high-traffic public rooms if needed.

---

## 26. Testing Strategy

### 26.1 Unit Tests

Test:

1. Nickname normalization.
2. Nickname validation.
3. Password hashing/verifying wrapper.
4. URL parsing and video ID extraction.
5. Queue selection algorithms.
6. Vote scoring.
7. Permission checks.
8. Native access-tier gating (Listener vs member) for interactive actions.
8. Rate-limit calculations.
9. Mechanic change transition rules.
10. External command parsing.
11. Integration signature verification and timestamp freshness.
12. Pre-play veto threshold calculations.
13. External reference resolution and expiration.
14. Song request policy evaluation.

### 26.2 Integration Tests

Test:

1. Open room as Listener → listen and view playlist → attempt to chat → rejected with upgrade prompt.
2. Claim protected nickname (protect-and-join) → Listener session upgraded to member in place → chat succeeds.
3. Authenticate existing protected nickname → rejoin with password.
4. Attempt protected nickname with wrong password.
5. Add YouTube URL → queue item created (member only).
6. Current track ends → next track selected.
7. Host changes mechanic → current song unaffected.
8. Moderator removes queue item.
9. Muted participant cannot chat.
10. Banned participant cannot reconnect.
11. External command `!sr` creates a queue item when policy allows.
12. Duplicate external message is handled idempotently.
13. External staff command removes a queue item and writes audit log.
14. Pre-play veto opens only when an alternate candidate exists.
15. Vetoed candidate is not reselected in the same advance cycle.
16. Outbound webhook failure does not roll back successful queue/playback changes.

### 26.3 WebSocket Tests

Test:

1. Connect with valid token.
2. Reject invalid token.
3. Reject member-only event on a listener-tier connection with `LISTENER_READ_ONLY`.
4. Broadcast chat to room only.
5. Broadcast queue updates.
6. Reconnect and receive snapshot.
7. Presence heartbeat timeout (verifying 25s client emit, 60s server cleanup, and database/Redis synchronization).
8. Presence reconnect and refresh convergence (verifying no duplicate entries are created for Listener, member, and host sessions).
9. Presence manager Redis-degraded fallback (verifying cleanup and query fallback to PostgreSQL when Redis is mock-unreachable).
10. Cross-instance event propagation.
11. Pre-play veto events propagate to native clients and embeds.
12. External settings changes broadcast to connected embeds.

### 26.4 End-to-End Tests

Test with Playwright or Cypress:

1. Two users join same room with different protected nicknames.
2. User A sends chat; User B sees it.
3. User A adds song; User B sees queue update.
4. Host changes playlist mechanic; both users see system message.
5. Protected nickname cannot be used by another user without password.
6. Listener opens room, hears playback and views playlist, and is blocked from chatting/voting/adding with an upgrade prompt.
7. Listener claims a protected nickname (protect-and-join) and gains full functionality without losing playback.
8. Read-only embed displays current track, queue, veto status, and command hints.
9. Embed does not expose mutation controls by default.
10. External chat command flow posts a bot-style result back into a test embedding site harness.

### 26.5 Load Tests

Scenarios:

1. 100 rooms with 10 users each.
2. 1 public room with 500 users.
3. Chat burst with rate limiting.
4. Queue voting burst.
5. WebSocket reconnect storm.
6. External command burst with rate limiting.
7. Outbound webhook failure/retry burst.
8. Public-room veto voting burst.

---

## 27. MVP Scope

### 27.1 MVP Must-Haves

1. Create room (host must hold a protected nickname).
2. Open any room as a read-only Listener (hear playback, view playlist) with no nickname or password.
3. Mandatory protected nickname creation/authentication as the gate to chat, vote, add songs, and all other native interactive functionality.
4. YouTube URL paste to add track.
5. Shared queue.
6. Current track playback with YouTube embed.
7. Real-time chat.
8. FIFO and voting queue modes.
9. Host-curated mode.
10. Host can change playlist mechanic with guardrails.
11. Host can skip/remove songs.
12. Host can mute/ban users.
13. Rate limits for chat, song adds, nickname password attempts.
14. Basic terms/privacy pages.
15. Server authority boundaries for external integrations documented and enforced if external integration MVP is included.

### 27.2 MVP Should-Haves

1. DJ rotation mode.
2. Skip voting.
3. Duplicate prevention.
4. Max duration setting.
5. Room-level queue lock.
6. Basic room setting history.
7. System chat messages.
8. Reconnect and room snapshot.
9. Read-only embeddable room/player/queue view.
10. External chat command bridge for `!sr`, `!song`, `!queue`, `!yay`, and `!nay`.
11. Pre-play veto for external chat integrations.
12. Staff external chat commands for remove, skip, lock/unlock, request policy, and veto settings.
13. Signed outbound bot webhook announcements.
14. Song request policy controls for public embedded rooms.

### 27.3 Post-MVP Features

1. In-app YouTube search.
2. YouTube playlist import.
3. Public room directory.
4. Room tags and discovery.
5. Persistent community rooms.
6. Moderator delegation.
7. Protected nickname profile settings.
8. Avatar/color customization.
9. Emoji reactions.
10. Mentions and slash commands.
11. Report system.
12. Advanced trust and safety dashboard.
13. Host secret rotation.
14. Nickname release/delete flow.
15. Authenticated embed identity bridge with direct embed voting controls.
16. Rich webmaster integration dashboard and analytics.
17. Advanced staff-command confirmation workflows.

---

## 28. Decision Log

All 18 open questions from previous versions have been resolved. Two additional decisions (DL-019, DL-020) were recorded in v1.4.0 for the mandatory native nickname-protection feature. Decisions are recorded below with rationale and status.

| ID | Question | Decision | Rationale | Status |
| -- | -------- | -------- | --------- | ------ |
| DL-001 | Should protected nicknames be global across the entire app or scoped to rooms? | **Global.** | Global nicknames make identity meaningful across rooms and align with the product goal of lightweight identity continuity. Room-scoped nicknames would create confusion when users move between rooms. | Accepted |
| DL-002 | Should room host authority be based on host link, host password, protected nickname binding, or a combination? | **MVP: host link/session. Phase 2: bind to protected nickname.** | Host link/session is simplest for MVP and matches the no-registration model. Binding to a protected nickname in Phase 2 adds recovery and continuity without requiring account registration. | Accepted |
| DL-003 | Should temporary rooms expire after 7, 14, or 30 days of inactivity? | **14 days.** | 14 days balances storage efficiency with user expectations. 7 days is too aggressive for rooms that might be used weekly; 30 days retains too much stale data. Configurable per-room in Phase 2. | Accepted |
| DL-004 | Should chat history be visible to users who join later? | **Yes, limited to the most recent 100 messages.** | Providing context helps late joiners understand the room state. The limit prevents overwhelming new participants and bounds storage/rendering cost. Paginated history is available via REST for older messages. | Accepted |
| DL-005 | Should public rooms appear in a directory in MVP or only later? | **Phase 2 only.** | MVP should focus on core room experience and moderation foundations. A public directory without mature moderation tools risks surfacing abusive or low-quality rooms. | Accepted |
| DL-006 | Should voting allow downvotes or only upvotes? | **Upvotes only in MVP; downvotes configurable in Phase 2.** | Upvote-only is simpler, friendlier for small groups, and avoids negative social dynamics in early rooms. Downvotes can be added as a room setting once moderation tools are mature. | Accepted |
| DL-007 | Should host-curated rooms allow participant suggestions by default? | **No.** Suggestions are disabled by default in host-curated mode. The host can enable the suggestions mechanic separately. | Host-curated mode is designed for full host control. Auto-enabling suggestions would undermine the curator's intent. Suggestion mode exists as a separate mechanic for rooms that want moderated input. | Accepted |
| DL-008 | How strict should nickname content moderation be? | **Block reserved names (admin, system, moderator, host, youtube, support) and visually confusable variants. No profanity filter in MVP.** | Reserved name blocking prevents impersonation of system roles. Profanity filtering is culturally variable and error-prone; defer to host moderation tools. Revisit with a configurable filter in Phase 2 if needed. | Accepted |
| DL-009 | What minimum password length should protected nicknames require? | **10 characters.** | 10 characters provides reasonable entropy for a no-recovery password system while being memorable. Shorter passwords increase brute-force risk against a system with no password reset. Strength checks (reject common passwords) supplement the length requirement. | Accepted |
| DL-010 | What is the acceptable YouTube playback sync tolerance? | **3 seconds.** | YouTube IFrame playback varies by client network, device, and buffer state. 3 seconds is acceptable for social listening rooms and matches the existing NFR-003 target. Tighter sync would require custom media synchronization infrastructure beyond MVP scope. | Accepted |
| DL-011 | Should external site integration be included in MVP delivery or treated as MVP/Phase 2 depending on current native-room completion? | **External integration is an MVP should-have (Section 27.2). Prioritize native room completion first; external integration follows in the same release if schedule permits, otherwise Phase 2.** | Native room experience is the product foundation. External integration adds significant surface area. Delivering it as a stretch goal within MVP preserves optionality without blocking the core launch. | Accepted |
| DL-012 | Should external participant records be retained per room, per integration, or globally per embedding site? | **Per integration per room.** | Per-integration-per-room scoping matches the data model constraint `UNIQUE(integration_id, room_id, external_user_id)` and ensures moderation state (mutes, bans) is room-scoped. Cross-room identity correlation is a Phase 2 consideration. | Accepted |
| DL-013 | Should requester's own `!yay`/`!nay` count in pre-play veto by default long term? | **Yes, allow requester votes unless abuse data suggests otherwise.** | Disallowing requester votes penalizes good-faith requesters and adds implementation complexity. If abuse patterns emerge (requesters always self-voting to block vetoes), a configurable policy can be introduced. | Accepted |
| DL-014 | When repeated vetoes exhaust alternatives, should rooms always play the last candidate, stop gracefully, or let hosts choose? | **MVP: play the last candidate without veto. Phase 2: make this configurable per room (play last, stop, or loop to first non-vetoed).** | Playing the last candidate ensures the room always has music. Stopping gracefully could frustrate listeners. Configurability is a natural Phase 2 addition. | Accepted |
| DL-015 | What account-age or trust signals should embedding sites optionally send for voter eligibility? | **MVP: no mandatory trust signals beyond stable external user ID. Accept optional `accountCreatedAt` and `messageCount` fields in the command payload for future eligibility rules.** | Requiring trust signals would increase integration complexity and block adoption. Accepting optional fields future-proofs the payload without imposing requirements on embedding sites. | Accepted |
| DL-016 | Should staff command changes require chat confirmation for destructive or broad actions in Phase 2? | **Yes, Phase 2 should add confirmation for destructive actions such as clearing the queue, changing request policy to closed, and permanent mutes.** | Destructive actions are difficult to reverse. Chat-based confirmation ("Type `!confirm` within 15s to clear the queue") adds a friction layer that prevents accidental damage. MVP staff commands execute immediately because the integration surface is small and staff users are trusted. | Accepted |
| DL-017 | What webhook retry limits and dead-letter behavior should be exposed to webmasters? | **3 retries with exponential backoff (2s, 8s, 32s). Failed deliveries after retries move to a dead-letter queue. MVP does not expose dead-letter inspection to webmasters; Phase 2 adds a webhook delivery dashboard.** | Bounded retries prevent runaway retry loops. Dead-letter queuing ensures no delivery is silently lost. Exposing the dead-letter queue in MVP adds integration dashboard scope that is not needed for initial adoption. | Accepted |
| DL-018 | Should external command prefixes be unique per room/channel, or can multiple integrations share the same prefix? | **Command prefixes must be unique per room per channel.** | Shared prefixes would create ambiguity about which integration should process a command. Uniqueness per room/channel is enforced as a `UNIQUE(room_id, channel_id, command_prefix)` constraint or equivalent application-layer validation. | Accepted |
| DL-019 | Should nickname protection be mandatory for native participation, and what can users without one do? | **Mandatory for participation, free to listen.** On the native `trackstacc.live` site, a password-protected nickname is required to chat, vote, add songs, react, or moderate. Users without one are read-only Listeners who may open rooms to hear playback and view the playlist. The requirement does not apply to external embeds or external chat command integrations. | Lifting the bar to a protected nickname makes every interactive actor accountable and impersonation-resistant, which strengthens moderation and abuse prevention, while free listening preserves low-friction reach and the no-registration ethos. Scoping the rule to the native site avoids disturbing the already-secure server-to-server embed model. This supersedes the previous "protection is optional" stance (v1.4.0; see Section 29). | Accepted |
| DL-020 | Can native Listeners read chat, and what is the default? | **Configurable per room via `listener_chat_visible`, default hidden.** Listeners get playback and the playlist by default; chat is hidden from them unless a host opts in. | The literal v1.4.0 scope is "listen and view the playlist," so the safe default keeps chat private to participants and avoids exposing conversation to unaccountable viewers. Hosts who want a more open, broadcast-style room can reveal read-only chat. | Accepted |

---

## 29. Recommended Product Decisions

1. **Let anyone listen for free.** Opening a native room to hear playback and view the playlist requires no nickname or password, preserving low-friction reach.
2. **Require a protected nickname for native participation.** As of v1.4.0, chatting, voting, adding songs, reacting, and moderating require a password-protected nickname. This supersedes the earlier "protection is optional" recommendation; it makes every interactive actor accountable without introducing email or account registration (see DL-019).
3. **Warn clearly that nickname passwords cannot be recovered.** This is now doubly important because a forgotten password blocks participation, not just a single nickname; the warning avoids support expectations.
4. **Use global protected nicknames.** This makes identity meaningful across rooms.
5. **Let host change playlist mechanic later.** This is useful and should be supported.
6. **Do not interrupt current song when mechanic changes.** This avoids chaotic room behavior.
7. **Preserve existing queue by default.** This is the least surprising transition.
8. **Announce mechanic changes in chat.** Transparency prevents confusion.
9. **Start with URL paste, not in-app search.** It reduces API quota pressure and implementation complexity.
10. **Make public discovery a Phase 2 feature.** MVP should focus on room experience and moderation foundations.
11. **Keep embeds read-only by default.** Voting and queue mutations should flow through a trusted server-side identity bridge, not browser-provided identity.
12. **Use hybrid pre-play veto threshold for public external rooms.** Fixed thresholds are simple but easier to abuse at scale.
13. **Make per-user cooldown the default external song request policy.** It is a practical default for public embedded rooms.
14. **Treat outbound bot webhooks as side effects.** Failed bot delivery should be observable and retried, but should not roll back successful room state changes.
15. **Keep native slash commands separate from external chat commands.** Native in-app slash commands may remain Phase 2 while external chat command integration is a v1.1 integration capability.

---

## 30. Implementation Milestones

### 30.0 Team Assumptions and Effort Conventions

Estimates assume a small product team of 2–3 full-stack engineers, 1 product/design resource (part-time), and access to a part-time DevOps/infrastructure resource. Effort is expressed in t-shirt sizes per milestone:

| Size | Approximate Duration (2–3 engineers) | Story Points (relative) |
| ---- | ------------------------------------ | ----------------------- |
| S    | 1–2 weeks | 5–13 |
| M    | 2–4 weeks | 13–21 |
| L    | 4–6 weeks | 21–34 |
| XL   | 6–10 weeks | 34–55 |

Total estimated MVP duration: 16–24 weeks for Milestones 1–6 with 2–3 engineers. Milestone 7 (external integrations) adds 6–10 weeks if included in MVP.

### Milestone 1: Foundation

**Effort: M (2–4 weeks)**

1. Project setup.
2. Database schema (including `room_sessions.access_tier` and `rooms.listener_chat_visible`).
3. Room creation (host protect-and-join).
4. Listener session (`/listen`) and member join/upgrade flow with the two-tier access model.
5. Session management with tier encoded in the signed token; server-side tier gating middleware (FR-028, NFR-038).
6. WebSocket connection and room snapshot, tier-aware.

### Milestone 2: Chat and Presence

**Effort: S (1–2 weeks)**

1. Real-time chat (member-tier send only; Listener visibility gated by `listener_chat_visible`).
2. System messages.
3. Presence list.
4. Chat rate limiting.
5. Mute support.

### Milestone 3: YouTube Queue and Playback

**Effort: M (2–4 weeks)**

1. YouTube URL parser.
2. Metadata fetch/cache.
3. Queue item creation.
4. YouTube player integration.
5. Playback state broadcast.
6. Track end/skip handling.

### Milestone 4: Playlist Mechanics

**Effort: M (2–4 weeks)**

1. FIFO mode.
2. Voting mode.
3. Host-curated mode.
4. Mechanic change flow.
5. Queue transition policies.
6. System/audit messages.

### Milestone 5: Nickname Protection (Participation Gate)

**Effort: M (2–4 weeks)**

Note: the core tier model and server-side gating land in Milestone 1 because chat (M2) and queue (M3/M4) depend on it. This milestone completes the protection feature set and the Listener-to-member experience.

1. Claim nickname (single-step protect-and-join).
2. Authenticate protected nickname.
3. Failed attempt rate limiting.
4. Listener-tier UI: read-only experience plus inline upgrade prompts wherever interactive controls are gated (FR-029).
5. In-place Listener-to-member session upgrade without full rejoin.
6. Protected nickname UI states.
7. Password warning and validation, including the "no recovery blocks participation" messaging.

### Milestone 6: Moderation and Hardening

**Effort: M (2–4 weeks)**

1. Ban support.
2. Remove queue item.
3. Delete chat message.
4. Duplicate prevention.
5. Max song duration.
6. Observability.
7. Terms/privacy/compliance review.

### Milestone 7: External Embeds and Chat Integrations

**Effort: XL (6–10 weeks)**

1. Site integration configuration and secret management.
2. Read-only room/player/queue embed with origin allowlist.
3. Server-to-server external command ingestion.
4. External participant mapping and command audit records.
5. Public commands: `!sr`, `!song`, `!np`, `!queue`, `!yay`, `!nay`, `!help music`.
6. Pre-play veto windows, votes, thresholds, and result announcements.
7. Staff commands for remove, force skip, request policy, veto settings, duration, and duplicate policy.
8. Signed outbound bot webhook delivery with retry policy.
9. Abuse controls for command bridge, queue, votes, staff actions, and embeds.

---

## 31. Acceptance Criteria

### 31.0 Priority 1 Audit Remediation

- The SDD includes a formal error code registry for REST, WebSocket, and external command responses.
- REST, WebSocket, and external command errors use consistent structured envelopes, request IDs, retryability fields, and retry guidance.
- Native pages, REST APIs, Socket.IO, embed pages, and external command endpoints have explicit CORS and CSP policies.
- Dependency circuit breaker behavior is specified for YouTube Data API, Redis, PostgreSQL, and outbound webhook endpoints.
- The backend framework decision is resolved as Fastify 5 with TypeScript and Socket.IO for MVP.
- The permission matrix covers External Participant, External Staff, and Integration Bot roles.

### 31.0.1 Priority 2 Audit Remediation

- Architecture diagrams (system context, container, component dependency direction) are included in Section 12.5.
- Three sequence diagrams are included for critical flows: external song request lifecycle, pre-play veto voting cycle, and playlist mechanic change with queue transition (Section 12.6).
- A database migration strategy covers Prisma Migrate tooling, zero-downtime patterns, rollback procedures, and migration testing (Section 14.3).
- API conventions document versioning strategy, pagination format, rate limit response headers, request ID correlation, and naming conventions (Section 15.1).
- WebSocket reconnection backoff is specified with exponential backoff, jitter, retry limits, and user-facing behavior per phase (Section 16.1.1).
- External integration security content is consolidated under Section 19.5 as the single authoritative source, with cross-references from Sections 12.4, 13.11, 20.3, 31.7, and 31.9.
- All 18 open questions are resolved in a formal decision log with rationale and accepted status (Section 28).
- Implementation milestones include team assumptions and t-shirt effort estimates (Section 30.0).
- A requirements traceability matrix maps FRs and NFRs to design components, API endpoints, and test coverage areas (Appendix D).

### 31.0.2 v1.4.0 Mandatory Native Nickname Protection

- Any user can open a native room and listen to playback and view the playlist with no nickname and no password.
- A Listener attempting to chat, vote, add a song, react, skip-vote, or perform a moderation/settings action is rejected with `LISTENER_READ_ONLY` or `NICKNAME_PROTECTION_REQUIRED` and shown a prompt to claim or authenticate a protected nickname.
- A user can obtain full functionality by either authenticating an existing protected nickname or claiming a new one with a password in a single protect-and-join step.
- A Listener session can be upgraded to member tier in place without losing playback continuity.
- Tier enforcement is applied server-side on every REST request and WebSocket event and cannot be bypassed by client manipulation (NFR-038).
- Native Listeners can read chat only when the room's `listener_chat_visible` setting is enabled; the default is hidden.
- The host must hold a protected nickname to exercise host authority; an unauthenticated creator is treated as a Listener of their own room until they protect a nickname.
- External embeds and external chat command integrations are unaffected: they neither require nor prompt for a native protected nickname.

### 31.1 Room Creation

- A user can create a room without email or registration.
- A host session is established.
- A shareable room link is generated.
- Host can enter the room with full authority only after claiming or authenticating a protected nickname.

### 31.2 Room Join

- A Listener (no protected nickname) cannot chat, vote, or add songs, and is prompted to get a protected nickname.
- The app never assigns a generic guest nickname; a Listener has no nickname at all.
- Joining as a member requires a protected nickname (authenticated or newly claimed with a password).
- Wrong protected nickname password is rejected and rate-limited.

### 31.3 Chat

- Member-tier participants can exchange real-time messages.
- Listeners cannot send chat; they can read it only when `listener_chat_visible` is enabled.
- Muted users cannot send chat messages.
- Chat messages are sanitized.
- System messages appear for relevant room events.

### 31.4 Queue

- Participants can add valid YouTube URLs when allowed.
- Invalid or blocked videos are rejected with useful messages.
- Duplicate and duration rules are enforced.
- Queue updates appear in real time.

### 31.5 Playback

- All connected clients see the same current track.
- Joining clients receive current playback state.
- Host can skip current track.
- Track end advances queue.

### 31.6 Playlist Mechanic Changes

- Host can change playlist mechanic.
- Current song is not interrupted.
- Existing queue is preserved by default.
- New additions follow the new mechanic.
- A system message announces the change.
- Change is recorded in settings history/audit log.

### 31.7 External Site Integration

External integration security requirements are specified authoritatively in Section 19.5. The acceptance criteria below verify implementation of those requirements.

- Host can create an external site integration with allowed origin, channel ID, command prefix, webhook URL, enabled commands, and staff mappings.
- Trackstacc returns an iframe embed URL and one-time server-side integration secret material.
- Read-only embed displays current track, YouTube player where configured, queue preview, pre-play veto state, command hints, and request policy state.
- Read-only embed does not accept song requests, votes, or staff actions directly by default.
- Inbound external commands require authentication, timestamp freshness, idempotency, replay protection, and schema validation.
- `!sr <youtube-url>` queues an allowed song and returns a bot message such as `Queued [K7Q] "Song Title" - requested by @alice. Position: 4.`
- `!song` or `!np` returns the current song.
- `!queue` returns upcoming queue entries with references.

### 31.8 Pre-Play Veto

- Pre-play veto opens only before playback starts and only when an alternate candidate exists.
- `!yay` keeps the active candidate; `!nay` vetoes the active candidate.
- One active vote per eligible user is enforced and vote changes replace prior votes.
- Net nays are calculated as `nayCount - yayCount`.
- Candidate is vetoed when net nays reaches the configured threshold.
- Candidate starts playback when the window closes without veto.
- No-op vote cases return clear messages such as `No song is currently open for veto voting.` or `There is no alternate song in the queue, so veto voting is closed.`

### 31.9 External Staff Commands and Abuse Controls

Staff command authorization and abuse controls follow the authoritative security specification in Section 19.5 and abuse controls in Section 20.3.

- Staff commands are authorized server-side through external user ID allowlist or trusted role mapping.
- `!rm <ref>` removes a queue item and announces the result.
- `!skip <reason>` force-skips current song and records the reason in audit metadata.
- Staff can change song request policy and veto settings when permitted.
- Staff actions are audit logged and announced.
- Outbound bot webhooks are signed and webhook failure does not roll back successful room state changes.
- Embed origins are restricted and integration secrets are never exposed to browser embeds.
- `!music mute <@displayName | externalUserId> [duration]` blocks the target's `!sr`, `!yay`, and `!nay` commands while still allowing `!song` and `!queue`.
- Timed mutes auto-expire after their configured duration.
- `!music unmute <@displayName | externalUserId>` lifts a mute early and restores the target's permissions immediately.
- Mute/unmute actions are audit logged and announced as bot messages.

### 31.10 Presence Lifecycle

- **Stable Identity Tracking:** Native room presence is keyed by stable room session identity (`room_sessions.id`), rather than by transient socket ID or display name.
- **Tab/Socket Reconciliation:** Multiple active sockets or browser tabs opened by the same user in the same room reconcile to a single active participant row.
- **Listener Refresh/Reconnect:** A Listener refreshing or reconnecting to the room reuses their existing active Listener session and does not create duplicate Listener rows.
- **Member Refresh/Reconnect:** An authenticated member refreshing or reconnecting to the room reuses their existing active member session and does not create duplicate member rows.
- **Host Refresh/Reconnect:** A host refreshing or reconnecting to the room preserves their host/member authority and does not leave stale host rows behind.
- **Heartbeat & Sweep Timeout:** Connected web clients emit `presence.heartbeat` every 25 seconds, and the server sweeps inactive participants whose last seen timestamp is older than 60 seconds from both Redis and PostgreSQL.
- **Realtime Convergence:** Upon connection or reconnection, clients receive a server-authoritative `room.snapshot`, and participant updates are broadcast via `presence.updated`. Clients overwrite local state with these events to guarantee convergence.
- **Redis Degradation Fallback:** If Redis is unavailable, the presence manager fallback logic bounds the presence degradation by using PostgreSQL `lastSeenAt` and `leftAt` fallback semantics to query and cleanup active participants.
- **External Scoping:** External participants (embed viewers) do not participate in native presence tracking and are explicitly out of scope.

---

## 32. Risks and Mitigations

| Risk                            | Impact                        | Mitigation                                                        |
| ------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| YouTube API quota exhaustion    | Search/metadata features fail | Start with URL paste, cache metadata, monitor quota.              |
| YouTube embed restrictions      | Some videos fail to play      | Detect failures, mark failed, skip gracefully.                    |
| No-registration abuse           | Spam and impersonation        | Rate limits, protected nicknames, host moderation.                |
| Host link leaked                | Room takeover risk            | Host secret rotation in Phase 2, bind host to protected nickname. |
| Forgotten nickname passwords    | Support burden; also blocks participation entirely under that nickname | Clear up-front warning; no recovery in MVP; Phase 2 recovery without mandatory registration (LIM-001). |
| Mandatory protection reduces participation | Fewer users convert from listening to chatting/queuing | Keep listening fully free and instant; one-step protect-and-join; inline, contextual upgrade prompts rather than hard walls. |
| Listener confusion about why controls are disabled | Frustration, perceived bugs | Show clear "get a protected nickname to take part" prompts in place of gated controls (FR-029); never silently fail. |
| Public room moderation          | Toxic behavior                | Delay public directory until moderation tools mature.             |
| Playback sync drift             | Poor listening experience     | Periodic resync and server-authoritative state.                   |
| XSS via chat/nicknames/metadata | Security incident             | Escape output, sanitize input, CSP.                               |
| External command forgery        | Unauthorized room mutation    | Signed commands, timestamp freshness, replay protection, and idempotency. |
| External identity instability   | Unfair voting/rate limiting   | Require stable external user IDs and treat browser identity as untrusted. |
| Veto abuse                      | Queue starvation              | Hybrid thresholds, eligibility rules, rate limits, and no veto when no alternate exists. |
| Staff role spoofing             | Privileged abuse              | Staff allowlists and trusted role mappings configured per integration. |
| Webhook failure                 | Missing chat announcements    | Retry with backoff, log failures, and avoid rolling back successful state changes. |
| Embed secret leakage            | Integration compromise        | Public embed token separate from server-side secret; no secrets in browser payloads. |
| Mute abuse / accidental permanent mutes | Blocked legitimate participants indefinitely | Rate-limit mute commands per actor, audit every mute, require explicit duration formatting, allow early unmute. |
| TTL-based auto-expiry race    | Expired mute not detected quickly | Lazy check on next command is acceptable; periodic cleanup can supplement. |

---

## 33. Appendix A: Recommended Default Settings

| Setting                             | Default                                             |
| ----------------------------------- | --------------------------------------------------- |
| Playlist mechanic                   | FIFO for private rooms; voting for public rooms.    |
| Max song duration                   | 10 minutes.                                         |
| Duplicate policy                    | Block if already queued.                            |
| Chat rate limit                     | 5 messages per 10 seconds.                          |
| Add-song cooldown                   | 30 seconds.                                         |
| Nickname max length                 | 24 characters.                                      |
| Nickname min length                 | 2 characters.                                       |
| Protected nickname password minimum | 10 characters.                                      |
| Native participation requirement    | Protected nickname required to chat/vote/add/react; listening and viewing the playlist are free. |
| Listener chat visibility            | Hidden (`listener_chat_visible = false`).           |
| Skip vote threshold                 | 50% of active non-muted participants, minimum 2.    |
| Mechanic change cooldown            | None for private rooms; 5 minutes for public rooms. |
| Temporary room expiration           | 14 days after inactivity.                           |
| External embed mode                 | `player_and_queue_readonly`.                        |
| External command prefix             | `!`.                                                |
| External song request policy        | `per_user_cooldown`, 90 seconds.                    |
| External max pending per user       | 2.                                                  |
| External max queue size             | 50.                                                 |
| External duplicate policy           | `block_recent`.                                     |
| Pre-play veto window                | 20 seconds.                                         |
| Pre-play veto threshold             | Hybrid: 25% eligible voters, minimum 3 net nays.    |
| Pre-play veto only with alternate   | Enabled.                                            |
| External vote changes               | Allowed during active veto window.                  |

---

## 34. Appendix B: Example System Messages

| Event              | Message                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| User joined        | `Fredo joined the room.`                                                     |
| Song added         | `Fredo added “Song Title” to the queue.`                                     |
| Song skipped       | `Host skipped “Song Title”.`                                                 |
| Mechanic changed   | `Fredo changed playlist mode from First Come, First Served to Voting Queue.` |
| Queue locked       | `The host locked song additions.`                                            |
| Queue unlocked     | `The host unlocked song additions.`                                          |
| User muted         | `Fredo was muted by a moderator.`                                            |
| Nickname protected | `Fredo protected their nickname.`                                            |
| External song queued | `Queued [K7Q] "Song Title" - requested by @alice. Position: 4.`             |
| External up next   | `Up next [K7Q]: "Song Title" requested by @alice. Vote now: !yay to keep, !nay to veto. Needs 3 net nays to skip. Voting closes in 20s.` |
| Veto passed        | `Veto passed for [K7Q]: 5 nays, 1 yay - skipping "Song Title".`              |
| Veto failed/song starts | `Now playing [K7Q]: "Song Title" requested by @alice.`                 |
| No vote open       | `No song is currently open for veto voting.`                                 |
| Only one song      | `There is no alternate song in the queue, so veto voting is closed.`         |
| Staff remove       | `Removed [K7Q] "Song Title" from the queue.`                                |
| Staff skip         | `@mod skipped "Song Title". Reason: bad audio.`                             |
| Policy changed     | `Song requests are now limited to 1 request every 90 seconds per user.`      |
| User muted         | `@alice was muted from song requests for 30 minutes.`                        |
| User unmuted       | `@alice was unmuted and can request songs again.`                            |

---

## 35. Appendix C: Example Room State Snapshot

```json
{
  "room": {
    "id": "uuid",
    "slug": "friday-night-aux-a8x4",
    "name": "Friday Night Aux",
    "playlistMechanic": "voting",
    "queueLocked": false,
    "chatLocked": false,
    "maxSongDurationSeconds": 600,
    "externalChatMusic": {
      "embedMode": "player_and_queue_readonly",
      "commandPrefix": "!",
      "songRequestPolicy": "per_user_cooldown",
      "preplayVetoEnabled": true
    }
  },
  "currentPlayback": {
    "status": "playing",
    "queueItemId": "uuid",
    "videoId": "abc123",
    "title": "Example Song",
    "startedAt": "2026-05-31T20:09:00.000Z",
    "positionSeconds": 90
  },
  "queue": [
    {
      "queueItemId": "uuid",
      "title": "Next Song",
      "videoId": "def456",
      "addedBy": "Maya",
      "score": 4,
      "status": "queued"
    }
  ],
  "preplayVeto": {
    "status": "open",
    "candidateRef": "K7Q",
    "queueItemId": "uuid",
    "closesAt": "2026-05-31T20:13:20.000Z",
    "yayCount": 1,
    "nayCount": 5,
    "netNays": 4,
    "requiredNetNays": 3
  },
  "participants": [
    {
      "displayNickname": "Fredo",
      "role": "host",
      "protectedNickname": true,
      "presence": "online"
    }
  ],
  "recentMessages": [
    {
      "id": "uuid",
      "type": "system",
      "body": "Fredo changed playlist mode from FIFO to Voting Queue.",
      "createdAt": "2026-05-31T20:00:00.000Z"
    }
  ]
}
```

---

## 36. Final Recommendation

Version 1.3.0 addresses Priority 1 (implementation sign-off), Priority 2 (design review sign-off), and Priority 3 (living document maintenance) audit findings. The document now includes document metadata with a change log, a table of contents, architecture and sequence diagrams, a database migration strategy, comprehensive API conventions, WebSocket reconnection specification, consolidated security cross-references, a resolved decision log, effort-estimated milestones, a requirements traceability matrix, a Known Limitations and Technical Debt register, a Development Operations section covering CI/CD and environment strategy, formal `external_chat_music` JSONB schema documentation, and a periodic document review schedule.

Version 1.4.0 makes nickname protection mandatory for interactive participation on the native site while keeping listening free, introducing the Listener role and a two-tier native access model. Engineering should treat the server-side tier gate (FR-028, NFR-038), the Listener/member session model, and the protect-and-join flow as baseline MVP requirements landing in Milestone 1, and must preserve the existing read-only external embed and external chat command integration model unchanged.

Engineering should treat the error registry, CORS/CSP rules, dependency circuit breakers, Fastify backend decision, expanded permission matrix, API conventions, migration strategy, reconnection backoff, resolved decision log, and DevOps conventions as baseline MVP requirements rather than optional design notes.

Build the MVP around three core pillars:

1. **Listen free, participate with identity:** anyone can listen and view the playlist with no onboarding; chatting, voting, and queuing require a password-protected nickname (no registration, no email).
2. **Healthy collaborative rooms:** real-time chat, queue, voting/FIFO/host modes, and strong host moderation.
3. **Safe playlist flexibility:** host-selectable playlist mechanics that can be changed later without disrupting the current song or confusing participants.

The host should be allowed to set and later change the playlist mechanic, but the system must make that action transparent, reversible where possible, and non-disruptive by default. This gives rooms enough flexibility to evolve naturally while preserving trust among participants.

---

## 37. Appendix D: Requirements Traceability Matrix

This matrix maps functional requirements (FRs) and non-functional requirements (NFRs) to the design components, API endpoints, data tables, and test coverage areas that satisfy them. It is not exhaustive for every low-priority or Phase 2 requirement but covers all MVP-priority items and the most significant Phase 2 items.

### 37.1 Functional Requirements Traceability

| Requirement | Component(s) | API Endpoint(s) | Data Table(s) | Test Area(s) |
| ----------- | ------------ | ---------------- | -------------- | ------------- |
| FR-001 Room creation without registration | Room Service | `POST /api/v1/rooms` | `rooms` | Unit: room creation; Integration: create room flow |
| FR-002 Default playlist mechanic | Room Service | `POST /api/v1/rooms` | `rooms.playlist_mechanic` | Unit: mechanic default; Integration: create room |
| FR-003 Host authority via secret | Room Service, Identity Service | `POST /api/v1/rooms`, `POST /api/v1/rooms/:roomId/host/claim` | `rooms.host_secret_hash` | Unit: host token; Integration: host claim |
| FR-006 Queue limits and duplicate rules | Queue Engine | `PATCH /api/v1/rooms/:roomId/settings` | `rooms` | Unit: limit validation; Integration: settings update |
| FR-010 Protected nickname required for native participation | Identity Service, Auth Middleware | `POST /api/v1/rooms/:roomId/join` | `room_sessions.access_tier`, `nickname_claims` | Unit: tier gate; Integration: gated-action rejection |
| FR-019 Read-only Listener access | Identity Service, Frontend Client | `POST /api/v1/rooms/:roomId/listen` | `room_sessions.access_tier` | Integration: listen flow; E2E: read-only room |
| FR-028 Server-side rejection of interactive actions for non-members | Auth Middleware, Chat/Queue/Moderation Services | `POST /api/v1/rooms/:roomId/*`, WebSocket events | `room_sessions.access_tier` | Unit: tier enforcement; Integration: listener escalation attempt |
| FR-029 Inline upgrade prompts for Listeners | Frontend Client | N/A | N/A | E2E: gated control prompt |
| FR-078 Listener chat visibility setting | Chat Service | `PATCH /api/v1/rooms/:roomId/settings` | `rooms.listener_chat_visible` | Integration: listener chat visibility |
| FR-011 Nickname prompt | Frontend Client | N/A | N/A | E2E: join flow |
| FR-012 Never assign generic nicknames | Identity Service | `POST /api/v1/rooms/:roomId/join` | N/A | Unit: nickname validation |
| FR-020 Password-protect nickname | Identity Service | `POST /api/v1/nicknames/protect` | `nickname_claims` | Unit: claim creation; Integration: protect flow |
| FR-021 Authenticate protected nickname | Identity Service | `POST /api/v1/nicknames/authenticate`, `POST /api/v1/rooms/:roomId/join` | `nickname_claims` | Unit: password verify; Integration: protected join |
| FR-022 Rate-limit failed password attempts | Rate Limit Service | `POST /api/v1/rooms/:roomId/join` | Redis | Unit: rate limit calc; Integration: brute force |
| FR-025 Warn no password recovery | Frontend Client | N/A | N/A | E2E: protect nickname flow |
| FR-030 Add song by YouTube URL | Queue Engine, YouTube Metadata Service | `POST /api/v1/rooms/:roomId/queue/items` | `queue_items`, `tracks` | Unit: URL parsing; Integration: add song |
| FR-031 Extract and validate video IDs | YouTube Metadata Service | `POST /api/v1/rooms/:roomId/queue/items` | `tracks` | Unit: URL parsing |
| FR-032 Fetch metadata | YouTube Metadata Service | `POST /api/v1/rooms/:roomId/queue/items` | `tracks` | Unit: metadata fetch; Integration: add song |
| FR-033 Reject over-duration videos | Queue Engine | `POST /api/v1/rooms/:roomId/queue/items` | `rooms.max_song_duration_seconds` | Unit: duration check |
| FR-034 Reject duplicates | Queue Engine | `POST /api/v1/rooms/:roomId/queue/items` | `queue_items` | Unit: duplicate check |
| FR-037 Handle unavailable videos | YouTube Metadata Service, Queue Engine | `POST /api/v1/rooms/:roomId/queue/items` | `tracks.metadata_status` | Unit: unavailable handling |
| FR-040 Authoritative current track | Playback Coordinator | WebSocket `playback.state` | `queue_items` | Integration: playback state |
| FR-041 Clients receive playback state | Playback Coordinator | WebSocket `room.snapshot`, `playback.state` | `queue_items` | WebSocket: snapshot on connect |
| FR-042 Host skip | Playback Coordinator, Moderation Service | `POST /api/v1/rooms/:roomId/playback/skip` | `queue_items`, `room_moderation_actions` | Integration: host skip |
| FR-044 Auto-advance on track end | Playback Coordinator, Queue Engine | WebSocket `playback.clientState` | `queue_items` | Integration: track end advance |
| FR-050 FIFO mode | Queue Engine | `POST /api/v1/rooms/:roomId/queue/items` | `queue_items.position` | Unit: FIFO selection |
| FR-051 Voting mode | Queue Engine | `POST /api/v1/rooms/:roomId/queue/items/:id/vote` | `queue_items.score`, `queue_votes` | Unit: voting selection |
| FR-053 Host-curated mode | Queue Engine | `POST /api/v1/rooms/:roomId/queue/items` | `queue_items` | Unit: host-curated selection |
| FR-055 Change playlist mechanic | Room Service, Queue Engine | `PATCH /api/v1/rooms/:roomId/settings` | `rooms`, `room_settings_history` | Unit: mechanic change; Integration: change flow |
| FR-056 No interruption on change | Room Service, Playback Coordinator | `PATCH /api/v1/rooms/:roomId/settings` | `rooms` | Integration: mechanic change |
| FR-057 Announce change in chat | Chat Service | WebSocket `chat.message` | `chat_messages` | WebSocket: system message |
| FR-070 Real-time chat | Chat Service | WebSocket `chat.send` / `chat.message` | `chat_messages` | WebSocket: chat broadcast |
| FR-073 Chat rate limiting | Rate Limit Service, Chat Service | WebSocket `chat.send` | Redis | Unit: rate limit; WebSocket: rate limit |
| FR-075 Delete chat messages | Moderation Service | `DELETE /api/v1/rooms/:roomId/chat/messages/:id` | `chat_messages.deleted_at` | Integration: delete message |
| FR-076 Mute participants | Moderation Service | `POST /api/v1/rooms/:roomId/moderation/mute` | `room_sessions.is_muted` | Integration: mute flow |
| FR-080–FR-085 Host moderation | Moderation Service | `POST /api/v1/rooms/:roomId/moderation/*` | `room_moderation_actions` | Integration: moderation actions |
| FR-090 Show participants | Frontend Client, Presence Manager | WebSocket `presence.updated` | Redis, `room_sessions` | WebSocket: presence |
| FR-091 Presence updates | Presence Manager, Frontend Client | WebSocket `presence.heartbeat` / `presence.updated`, `/listen`, `/join` | `room_sessions`, Redis | WebSocket: presence lifecycle, integration: reconnect convergence |
| FR-110–FR-119 External site integration | External Command Service, Outbound Webhook Service | `POST /api/v1/rooms/:roomId/integrations/site`, `POST /api/v1/integrations/site-command`, embed endpoints | `site_integrations`, `external_participants`, `external_commands` | Integration: external command flow; E2E: embed display |
| FR-130–FR-143 Pre-play veto | Queue Engine (veto logic), Playback Coordinator | WebSocket veto events, `POST /api/v1/integrations/site-command` | `preplay_veto_votes`, `preplay_veto_windows`, `queue_items` | Unit: veto threshold; Integration: veto cycle |
| FR-150–FR-168 Staff commands and muting | External Command Service, Moderation Service | `POST /api/v1/integrations/site-command` | `external_commands`, `external_participants`, `room_moderation_actions` | Integration: staff command flow; Unit: mute expiry |
| FR-170–FR-179 Abuse prevention | Rate Limit Service, External Command Service | `POST /api/v1/integrations/site-command` | `external_commands`, Redis | Unit: rate limits; Integration: abuse scenarios |

### 37.2 Non-Functional Requirements Traceability

| Requirement | Design Section(s) | Implementation Area |
| ----------- | ------------------ | ------------------- |
| NFR-001 REST p95 < 200ms | 12.2 (Fastify), 25.1 (Deployment) | Load tests: API latency |
| NFR-002 WebSocket p95 < 100ms | 12.2 (Socket.IO), 16 (WebSocket Design) | Load tests: event propagation |
| NFR-003 Playback sync ≤ 3s | 18 (Playback Sync) | Integration: resync test |
| NFR-004 LCP < 2s | 12.2 (Next.js), 13.1 (Frontend) | E2E: page load |
| NFR-010–NFR-013 Scalability | 25.2 (Scaling Strategy) | Load tests: room capacity |
| NFR-020 99.5% uptime | 25 (Deployment), 23.6 (Circuit Breakers) | Monitoring: uptime tracking |
| NFR-021 YouTube degradation | 23.6.2 (YouTube degradation) | Integration: metadata failure |
| NFR-022 Reconnect with refresh | 16.1.1 (Reconnection Backoff) | WebSocket: reconnect test |
| NFR-030–NFR-035 Security | 19 (Security Design) | Unit: auth checks; Integration: permission tests |
| NFR-038 Server-side native tier enforcement | 9.2.1, 13.3, 16.2, 19.2 | Unit: tier middleware; Integration: listener escalation |
| NFR-036 Error code registry | 23.4 (Error Code Registry) | Unit: error code mapping |
| NFR-037 CORS/CSP policies | 19.6 (CORS and CSP) | Integration: CORS validation; Security: CSP audit |
| NFR-040–NFR-043 Privacy | 21 (Privacy Design) | Integration: no sensitive data in public payloads |
| NFR-050–NFR-053 YouTube compliance | 22 (YouTube Integration) | Manual: compliance checklist |
| NFR-060–NFR-069 External integration NFRs | 8.7, 12.4, 13.11, 19.5 | Integration: external command tests; Load: command burst |

---

## 38. Known Limitations and Technical Debt

This section tracks known MVP shortcuts, accepted limitations, and technical debt items that should be revisited in Phase 2 or later. It is a living register — items should be added as they are identified during implementation and reviewed at each milestone checkpoint (see Section 40).

### 38.1 Product Limitations

| ID | Limitation | Impact | Planned Resolution | Target |
| -- | ---------- | ------ | ------------------ | ------ |
| LIM-001 | No password recovery for protected nicknames. | Users who forget their nickname password lose access to that nickname permanently, and—because protection is now required to participate—lose the ability to chat, vote, or queue under it until they create a new protected nickname. | Phase 2: optional email-based recovery or trusted-device token flow. Recovery mechanism must not introduce mandatory registration. | Phase 2 |
| LIM-002 | No public room directory in MVP. | Rooms are only discoverable via direct link. Organic discovery and community growth are limited. | Phase 2: curated public directory with moderation maturity gates. | Phase 2 |
| LIM-003 | No profanity or content filter for nicknames. | Offensive nicknames are possible until a host manually moderates. | Phase 2: configurable word filter with host override. | Phase 2 |
| LIM-004 | Playback synchronization is approximate (1–3 second tolerance). | Participants may hear the same song at slightly different points. | Accepted for MVP. Tighter sync would require custom media synchronization infrastructure. | Accepted |
| LIM-005 | No mobile-native apps. | Mobile experience is browser-only. Push notifications, background audio, and native gestures are unavailable. | Post-MVP: evaluate React Native or PWA. | Post-MVP |
| LIM-006 | External embed is read-only by default. | Embed viewers cannot vote or add songs directly from the embed UI. All mutations flow through the server-to-server command bridge. | By design for MVP. Interactive embed with identity delegation is a Phase 2 consideration. | Phase 2 |
| LIM-007 | Mandatory protected nickname adds onboarding friction for native participation. | Users must create a password before chatting or queuing on the native site, which may lower conversion from listening to participating. Listening remains free. | Accepted for v1.4.0 as a deliberate trade for accountability and abuse resistance. Monitor listen-to-participate conversion; revisit one-step flow ergonomics and consider lighter trusted-device continuity in Phase 2. | Accepted |
| LIM-008 | Redis-degraded presence is approximate. | Presence list may lag or be updated only on fallback database checks rather than instantly on socket event triggers. | Bounded fallback to PostgreSQL lastSeenAt (60-second limit) preserves data integrity. | Accepted |

### 38.2 Technical Debt

| ID | Debt Item | Context | Risk if Unresolved | Planned Resolution | Target |
| -- | --------- | ------- | ------------------- | ------------------ | ------ |
| TD-001 | `external_chat_music` JSONB column on `rooms` table. | Stores ~15 configuration sub-fields as an opaque blob. Schema documented in Section 14.2, validated by Zod at application layer. | Difficult to query, index, or migrate individual sub-fields. Cross-room analytics on configuration patterns require full-column scans. | If per-field querying patterns emerge, promote sub-objects (`songRequestPolicy`, `preplayVeto`, `staffPermissions`, `webhook`, `rateLimits`) to dedicated relational tables or PostgreSQL generated columns with indexes. | Phase 2 |
| TD-002 | Single-process API and WebSocket gateway. | MVP runs REST API and WebSocket gateway in the same Fastify process for simplicity. | Limits independent scaling. A WebSocket-heavy room can saturate the process and degrade REST API latency for other rooms. | Separate WebSocket gateway from REST API workers when scaling demands it (see Section 25.2). | Post-MVP |
| TD-003 | No dead-letter inspection UI for failed outbound webhooks. | Failed webhook deliveries after 3 retries are queued but not visible to webmasters. | Webmasters cannot diagnose delivery failures without Trackstacc team intervention. | Phase 2: webhook delivery dashboard per integration (DL-017). | Phase 2 |
| TD-004 | YouTube metadata is not pre-cached or background-refreshed. | Metadata is fetched on demand when a song is added. Stale metadata (title changes, removals) is not detected until the next fetch. | A queued song's title or availability status may be outdated by playback time. | Phase 2: background metadata refresh job for queued items. Consider YouTube push notifications if available. | Phase 2 |
| TD-005 | No automated database backup verification. | Managed PostgreSQL backups exist, but restore testing is manual. | Backup integrity is unverified until a restore is needed. | Add automated weekly backup restore test to a staging environment. | Milestone 6 |
| TD-006 | Frontend coverage lighter than backend surface area. | Not every API capability is exposed in the UI (see README). Some moderation and queue mechanic flows are backend-only. | Features exist but are inaccessible to non-technical users. | Close UI coverage gaps during each milestone. Track coverage delta in milestone reviews. | Ongoing |

### 38.3 Maintenance Notes

Items are added to this section when an MVP shortcut is taken. Each item should include a brief context statement explaining why the shortcut was acceptable and what triggers resolution. Items are reviewed and either resolved or re-prioritized at each milestone review (Section 40).

---

## 39. Development Operations

This section covers the CI/CD pipeline, configuration management, environment strategy, and dependency management practices for the trackstacc.live monorepo.

### 39.1 CI/CD Pipeline

#### 39.1.1 Pipeline Stages

The CI/CD pipeline runs on every push to a feature branch and on every merge to `main`. The recommended pipeline tool is GitHub Actions, consistent with the GitHub-hosted monorepo.

**Stage 1 — Install and Validate**

1. Checkout repository.
2. Enable Corepack for pnpm 9.15.4.
3. Install dependencies: `pnpm install --config.confirmModulesPurge=false`.
4. Validate Prisma schema: `pnpm --filter api prisma validate`.

**Stage 2 — Lint and Type Check**

1. Run ESLint across all workspaces: `pnpm lint` (Turborepo-orchestrated).
2. Run TypeScript type checking: `pnpm typecheck` (Turborepo-orchestrated).

**Stage 3 — Test**

1. Start ephemeral PostgreSQL and Redis services (GitHub Actions service containers).
2. Apply migrations to ephemeral database: `pnpm --filter api prisma migrate deploy`.
3. Run unit and integration tests: `pnpm test` (Turborepo-orchestrated).
4. Collect coverage reports.

**Stage 4 — Build**

1. Build all packages and apps: `pnpm build` (Turborepo-orchestrated).
2. Build Docker images: `docker compose -f infra/docker-compose.prod.yml build`.
3. Tag images with commit SHA and branch name.

**Stage 5 — Deploy (main branch only)**

1. Push Docker images to container registry.
2. Trigger Coolify deployment webhook or use Coolify Git integration for automatic deploy.
3. Run post-deploy health checks: `curl <api-url>/health/ready`.
4. Run smoke tests against deployed environment.

#### 39.1.2 Branch Strategy

The project uses a trunk-based development model with short-lived feature branches.

1. `main` is the production-deployable branch. All merges to `main` trigger the full pipeline including deployment.
2. Feature branches are created from `main` and merged back via pull request after CI passes.
3. Pull requests require passing CI (stages 1–4) and at least one reviewer approval.
4. Hotfix branches may be created from `main` and merged directly with expedited review.

### 39.2 Configuration Management

#### 39.2.1 Environment Variables

All runtime configuration is managed through environment variables. No secrets are committed to the repository.

1. **Local development:** `.env` file at the repo root (git-ignored). `.env.example` documents all required and optional variables with safe placeholder values.
2. **CI:** GitHub Actions secrets and environment variables. Secrets are scoped to the repository and injected at pipeline runtime.
3. **Production:** Managed through Coolify environment configuration (see `infra/coolify/coolify.env.example`). Secrets are stored in Coolify's encrypted secret store, not in the repository or Docker images.

#### 39.2.2 Configuration Hierarchy

Variable precedence (highest to lowest):

1. Process environment variables (set by Coolify, Docker, or shell).
2. `.env` file (local development only, loaded by dotenv).
3. Application defaults (coded in configuration modules with explicit fallbacks).

Required variables (`DATABASE_URL`, `REDIS_URL`, `YOUTUBE_API_KEY`, `SESSION_SECRET`, `HOST_SECRET_SALT`) cause a startup failure with a descriptive error if missing. Optional variables (`CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`) fall back to documented defaults.

### 39.3 Environment Strategy

| Environment | Purpose | Infrastructure | Data |
| ----------- | ------- | -------------- | ---- |
| Local | Developer workstation | Docker Compose services (PostgreSQL 16, Redis 7) on localhost. Apps run via `pnpm dev`. | Seeded with `pnpm db:seed`. Disposable. |
| CI | Automated pipeline | Ephemeral GitHub Actions service containers. Destroyed after each run. | Migrations applied fresh each run. No persistent data. |
| Staging | Pre-production validation | Coolify-managed deployment mirroring production topology. Managed PostgreSQL and Redis instances (smaller tier). | Seeded or restored from anonymized production snapshot. Reset periodically. |
| Production | Live user traffic | Coolify-managed deployment. Managed PostgreSQL with automated backups. Managed Redis with persistence. | Production data with daily automated backups and 14-day retention. |

#### 39.3.1 Environment Parity

Local, CI, staging, and production environments use the same PostgreSQL major version (16), Redis major version (7), Node.js version (20+), and pnpm version (9.15.4). Docker images are identical across staging and production; only environment variables differ.

### 39.4 Dependency Management

#### 39.4.1 Monorepo Tooling

The project uses pnpm workspaces with Turborepo for task orchestration.

1. **pnpm workspaces** manage cross-package dependencies. Internal packages (`packages/types`, `packages/ui`, `packages/config`) are referenced by workspace protocol (`workspace:*`).
2. **Turborepo** orchestrates build, lint, typecheck, and test tasks with dependency-aware caching and parallel execution.
3. **Corepack** pins the pnpm version to 9.15.4 across all environments.

#### 39.4.2 Dependency Update Policy

1. **Security patches:** applied immediately. `pnpm audit` runs in CI; critical/high vulnerabilities fail the pipeline.
2. **Minor/patch updates:** reviewed and applied weekly or biweekly. Turborepo cache invalidation ensures affected packages are rebuilt and retested.
3. **Major version upgrades:** evaluated individually. Major upgrades to core dependencies (Next.js, Fastify, Prisma, Socket.IO) require a dedicated branch with full regression testing before merge.

#### 39.4.3 Key Dependencies and Constraints

1. Prisma schema lives at the repo root (`prisma/schema.prisma`), not under `apps/api`. Prisma packages are present at the workspace root so generation works from the root schema location.
2. `packages/types` uses extensionless source imports so the Next.js app can transpile the workspace package via its `transpilePackages` configuration.
3. `apps/web/next.config.mjs` must remain `.mjs`; Next.js 14 in this repo does not support `next.config.ts`.
4. The `@prisma/client` import path must be consistent between the root-level generation and the `apps/api` runtime. The `db:generate` script ensures this.

#### 39.4.4 Lock File and Reproducibility

`pnpm-lock.yaml` is committed and CI uses `--frozen-lockfile` to ensure reproducible installs. Lock file updates are committed in dedicated PRs to keep dependency changes visible in code review.

---

## 40. Document Review Schedule

This SDD is a living document. Periodic reviews ensure it stays accurate as the codebase evolves and implementation decisions are made.

### 40.1 Review Cadence

| Trigger | Review Type | Participants | Deliverable |
| ------- | ----------- | ------------ | ----------- |
| Milestone completion (Milestones 1–7) | Full document review | Engineering lead, product lead, author(s) | Updated SDD version, review record in Section 40.3 |
| Significant architecture change | Targeted section review | Affected engineers, engineering lead | Updated affected sections, review record |
| Quarterly (if no milestone completed in quarter) | Staleness check | Engineering lead, author(s) | Confirmed current or updated sections, review record |
| Post-incident (production issue traceable to design gap) | Incident-driven review | Incident responders, engineering lead | Updated affected sections, new TD- or LIM- entry in Section 38, review record |

### 40.2 Review Process

1. The reviewer reads the relevant SDD sections alongside the current codebase and identifies discrepancies, stale content, missing coverage, and newly introduced technical debt.
2. Findings are documented as a list of proposed changes.
3. Changes are applied to the SDD and the version is bumped (patch for corrections, minor for new sections or significant updates).
4. The updated SDD is committed to the repository in a dedicated PR, reviewed like code, and merged.
5. A review record is added to Section 40.3.

### 40.3 Review History

| Date | Version | Reviewer(s) | Trigger | Summary |
| ---- | ------- | ----------- | ------- | ------- |
| 2026-06-04 | 1.1.2 | Engineering Lead | Priority 1 audit | Resolved 5 critical/significant findings: error code registry, CORS/CSP, circuit breakers, Fastify decision, external role permissions. |
| 2026-06-05 | 1.2.0 | Engineering Lead | Priority 2 audit | Resolved 8 design-review findings: architecture diagrams, migration strategy, API conventions, reconnection backoff, security consolidation, decision log, effort estimates, traceability matrix. |
| 2026-06-06 | 1.3.0 | Engineering Lead | Priority 3 audit | Resolved 6 living-document findings: document metadata, table of contents, known limitations register, DevOps section, JSONB schema documentation, review schedule. |
| 2026-06-07 | 1.4.0 | Engineering Lead | Feature change | Mandatory native nickname protection for participation; added Listener role and two-tier native access model; reworked permissions, flows, data model, API, WebSocket gating, errors, decisions, and acceptance criteria; scoped explicitly to exclude embeds. |