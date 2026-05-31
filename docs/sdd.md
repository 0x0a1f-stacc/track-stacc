# Software Design Document: Collaborative YouTube Playlist Rooms

**Project name:** trackstacc.live
**Document type:** Software Design Document (SDD)
**Version:** 1.0
**Status:** Draft for product and engineering review
**Primary concept:** A no-registration collaborative music-room web application where users join with manually chosen nicknames, chat in real time, collaboratively manage a YouTube-powered playlist, and optionally password-protect nicknames to prevent impersonation.

---

## 1. Executive Summary

This web application allows users to create and join real-time music rooms. Each room has a shared YouTube playback experience, a collaborative queue, chat, and configurable playlist mechanics such as first-come-first-served, voting queue, DJ rotation, host-curated mode, and moderated suggestions.

The defining product constraint is **no traditional registration**. Users do not need email, OAuth, or account creation. However, users must enter a nickname before participating. The system never assigns generic anonymous names such as `guest_1234`. Nicknames can optionally be password-protected, enabling lightweight identity continuity without requiring full accounts.

The room creator, called the **host**, can configure room behavior, including the playlist mechanic. The host may change the playlist mechanic later, subject to transparent guardrails: the current song is not interrupted, existing queue items are preserved by default, changes are announced in chat, and potentially disruptive changes require confirmation.

---

## 2. Goals and Non-Goals

### 2.1 Goals

1. Provide instant music-room creation with minimal onboarding.
2. Require every active participant to choose a nickname before chatting, voting, or adding tracks.
3. Support optional password-protected nicknames without email or registration.
4. Enable collaborative YouTube-based music playback.
5. Provide real-time synchronized room state, queue updates, voting, chat, and moderation events.
6. Support multiple playlist mechanics suitable for different social contexts.
7. Allow the room creator to configure and later change playlist mechanics safely.
8. Provide basic moderation tools suitable for no-registration public and private rooms.
9. Design for MVP delivery while leaving room for future public discovery, profiles, persistent rooms, and richer moderation.

### 2.2 Non-Goals for MVP

1. No native audio hosting, downloading, transcoding, or re-streaming of music.
2. No full user account system with email verification or OAuth.
3. No direct YouTube account integration for end users in MVP.
4. No monetization, subscriptions, advertisements, or tipping in MVP.
5. No native mobile apps in MVP.
6. No global friend graph or private messaging in MVP.
7. No guaranteed sample-accurate synchronized playback across clients.
8. No full trust-and-safety admin console beyond basic moderation tools.

---

## 3. Product Overview

### 3.1 Core User Story

A user creates a room, selects a playlist mechanic, shares the room link, and friends join by entering their chosen nicknames. Users chat, add YouTube songs, vote or take DJ turns depending on the room mechanic, and listen together.

### 3.2 High-Level Experience

1. Visitor opens a room URL.
2. Visitor is prompted to enter a nickname.
3. If the nickname is protected, the visitor must enter the nickname password.
4. Once admitted, the participant enters the room.
5. Participant can chat, view current playback, inspect the queue, and interact according to room permissions.
6. Participant may protect their nickname by setting a password.
7. Host and moderators can manage queue, chat, room settings, and playlist mechanic.

### 3.3 Core Differentiator

The product offers **identity without registration**:

> Pick a nickname. Use it immediately. Protect it with a password if you care about impersonation.

This reduces friction while still supporting identity continuity and room-level community behavior.

---

## 4. Definitions

| Term                 | Definition                                                                            |
| -------------------- | ------------------------------------------------------------------------------------- |
| Visitor              | A person who has opened the app but has not yet joined a room with a nickname.        |
| Participant          | A person currently in a room with a valid nickname/session.                           |
| Host                 | The room creator or holder of the room host secret.                                   |
| Moderator            | A participant with moderation permissions granted by the host.                        |
| Protected nickname   | A nickname reserved by password hash.                                                 |
| Unprotected nickname | A nickname not yet claimed by password.                                               |
| Room                 | A shared real-time space with chat, playback, queue, and settings.                    |
| Queue item           | A pending or historical track entry added to a room queue.                            |
| Playlist mechanic    | The algorithm/rule set that determines how songs enter and advance through the queue. |
| DJ rotation          | A playlist mechanic where active eligible users take turns adding songs.              |
| Voting queue         | A playlist mechanic where queued songs are prioritized by votes.                      |
| FIFO                 | First-in-first-out queue mechanic.                                                    |
| Suggestion mode      | A mechanic where users submit songs that require host/mod approval.                   |
| Session              | Browser/device-level authenticated room participation token.                          |
| Presence             | Real-time online/offline state of users in a room.                                    |

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

### 7.2 Room Joining and Nicknames

| ID     | Requirement                                                                                      | Priority |
| ------ | ------------------------------------------------------------------------------------------------ | -------- |
| FR-010 | Users must manually enter a nickname before chatting, voting, reacting, or adding songs.         | MVP      |
| FR-011 | The system must not auto-generate `guest_1234`-style names for participants.                     | MVP      |
| FR-012 | Nicknames are normalized for uniqueness checks.                                                  | MVP      |
| FR-013 | Nickname display casing is preserved after normalization.                                        | MVP      |
| FR-014 | If a nickname is protected, the user must provide the correct password to use it.                | MVP      |
| FR-015 | If a nickname is unprotected, the user may use it immediately unless blocked by room moderation. | MVP      |
| FR-016 | Users may protect their current nickname by setting a password.                                  | MVP      |
| FR-017 | Users may change nicknames, subject to protected-name authentication and rate limits.            | MVP      |
| FR-018 | Offensive, reserved, or confusing nicknames may be blocked by policy.                            | MVP      |

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
| FR-071 | Visitors who have not entered a nickname cannot chat.                                                              | MVP      |
| FR-072 | Chat messages include nickname, timestamp, and room context.                                                       | MVP      |
| FR-073 | Chat messages are rate-limited.                                                                                    | MVP      |
| FR-074 | System messages announce joins, nickname changes, song additions, skips, moderation actions, and mechanic changes. | MVP      |
| FR-075 | Hosts/moderators can delete chat messages.                                                                         | MVP      |
| FR-076 | Hosts/moderators can mute participants.                                                                            | MVP      |
| FR-077 | Optional emoji reactions, mentions, and slash commands are supported.                                              | Phase 2  |

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

### 8.4 Security

| ID      | Requirement                                                           | Target                                |
| ------- | --------------------------------------------------------------------- | ------------------------------------- |
| NFR-030 | Nickname passwords must be securely hashed.                           | Argon2id preferred; bcrypt acceptable |
| NFR-031 | Session tokens must be signed, random, and httpOnly where applicable. | required                              |
| NFR-032 | Host secrets must be high-entropy and non-guessable.                  | required                              |
| NFR-033 | All writes must be authorized server-side.                            | required                              |
| NFR-034 | Chat and room input must be sanitized.                                | required                              |
| NFR-035 | API and real-time events must be rate-limited.                        | required                              |

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

---

## 9. User Roles and Permissions

### 9.1 Roles

| Role                    | Description                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Visitor                 | Has not joined a room with a nickname. Can view limited room landing state if allowed. |
| Participant             | Joined room with nickname. Can chat and interact according to room settings.           |
| Protected Nickname User | Participant authenticated against a protected nickname.                                |
| Host                    | Controls room settings, moderation, queue, and playlist mechanic.                      |
| Moderator               | Delegated moderation role. Optional in MVP, stronger in Phase 2.                       |
| System                  | Server-generated events and automated actions.                                         |

### 9.2 Permission Matrix

| Action                   | Visitor |                 Participant |              Protected User | Moderator | Host |
| ------------------------ | ------: | --------------------------: | --------------------------: | --------: | ---: |
| View public room landing |     Yes |                         Yes |                         Yes |       Yes |  Yes |
| Join room                |     Yes |                         N/A |                         N/A |       N/A |  N/A |
| Chat                     |      No |                         Yes |                         Yes |       Yes |  Yes |
| Add song                 |      No |                Configurable |                Configurable |       Yes |  Yes |
| Vote                     |      No |                         Yes |                         Yes |       Yes |  Yes |
| Protect nickname         |      No |                         Yes |                         N/A |       Yes |  Yes |
| Skip by vote             |      No |                         Yes |                         Yes |       Yes |  Yes |
| Force skip               |      No |                          No |                          No |       Yes |  Yes |
| Delete chat message      |      No |                          No |                          No |       Yes |  Yes |
| Remove queue item        |      No | Own item only, configurable | Own item only, configurable |       Yes |  Yes |
| Mute/ban participant     |      No |                          No |                          No |       Yes |  Yes |
| Change playlist mechanic |      No |                          No |                          No |  Optional |  Yes |
| Change room settings     |      No |                          No |                          No |  Optional |  Yes |

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
6. User is prompted to enter nickname.
7. User enters room as host.
8. Host can copy share link.

### 10.2 Join Room Flow

1. Visitor opens room link.
2. App shows room name, current track, participant count, and nickname prompt.
3. Visitor enters nickname.
4. Server normalizes nickname.
5. If nickname is protected:
   - Prompt for password.
   - Validate password server-side.
   - Rate-limit failed attempts.

6. If nickname is unprotected:
   - Allow join, unless banned or blocked by policy.

7. Server creates room session.
8. Client opens WebSocket connection.
9. Server broadcasts presence update and optional system join message.

### 10.3 Protect Nickname Flow

1. Participant clicks **Protect Nickname**.
2. App explains:
   - This prevents others from using the nickname.
   - No email recovery exists in MVP.
   - Forgotten passwords cannot be recovered.

3. Participant enters password and confirmation.
4. Server validates password strength.
5. Server checks nickname is not already protected.
6. Server stores password hash.
7. Server marks participant as authenticated owner of protected nickname.
8. System confirms success.

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
  └─ YouTube IFrame Player / YouTube Data API
```

### 12.2 Suggested Technology Stack

| Layer            | Recommendation                                   | Rationale                                         |
| ---------------- | ------------------------------------------------ | ------------------------------------------------- |
| Frontend         | Next.js + React + TypeScript                     | Fast web UI, good routing, SSR where useful.      |
| Styling          | Tailwind CSS                                     | Rapid, consistent UI development.                 |
| Backend          | Node.js + TypeScript, NestJS or Fastify          | Strong real-time ecosystem.                       |
| Realtime         | WebSockets with Socket.IO or native ws           | Room-based events and reconnect support.          |
| Database         | PostgreSQL                                       | Durable relational state and constraints.         |
| Cache/pubsub     | Redis                                            | Presence, rate limiting, distributed room events. |
| ORM              | Prisma or Drizzle                                | Type-safe schema access.                          |
| Password hashing | Argon2id                                         | Strong password hashing for nickname protection.  |
| Deployment       | Fly.io, Render, Railway, AWS, GCP, or Kubernetes | Depends on scale and budget.                      |
| Observability    | OpenTelemetry + Sentry + structured logs         | Debugging real-time systems.                      |

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

The client is authoritative only for local UI state and local YouTube player events. Client player events are treated as signals, not trusted facts.

---

## 13. Component Design

### 13.1 Frontend Client

Responsibilities:

1. Render room UI.
2. Collect nickname and password inputs.
3. Display YouTube player.
4. Maintain WebSocket connection.
5. Render chat, queue, participant list, and room settings.
6. Handle optimistic UI carefully for chat and queue interactions.
7. Report player state events to server.
8. Resync playback state when instructed.

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
5. Create protected nickname claims.
6. Issue participant room sessions.
7. Prevent nickname impersonation in active rooms.

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

1. Accept chat messages from authorized participants.
2. Apply rate limits and content rules.
3. Store recent messages.
4. Broadcast chat events.
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
| `created_at`                | TIMESTAMP      | Creation time.                                           |
| `updated_at`                | TIMESTAMP      | Last settings update.                                    |
| `expires_at`                | TIMESTAMP NULL | For temporary rooms.                                     |
| `last_active_at`            | TIMESTAMP      | Room activity.                                           |

#### `room_sessions`

Represents participants in rooms.

| Column                | Type           | Notes                                   |
| --------------------- | -------------- | --------------------------------------- |
| `id`                  | UUID           | Primary key.                            |
| `room_id`             | UUID           | FK to rooms.                            |
| `nickname_claim_id`   | UUID NULL      | FK if protected nickname authenticated. |
| `normalized_nickname` | TEXT           | Current nickname key.                   |
| `display_nickname`    | TEXT           | Display nickname.                       |
| `role`                | ENUM           | `participant`, `moderator`, `host`.     |
| `session_token_hash`  | TEXT           | Token hash.                             |
| `is_muted`            | BOOLEAN        | Room-level mute.                        |
| `is_banned`           | BOOLEAN        | Room-level ban.                         |
| `joined_at`           | TIMESTAMP      | Initial join.                           |
| `last_seen_at`        | TIMESTAMP      | Presence update.                        |
| `left_at`             | TIMESTAMP NULL | Last leave.                             |

Constraints:

- Unique active nickname per room, unless same authenticated session is reconnecting.

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

---

## 15. API Design

### 15.1 REST API Principles

1. REST endpoints handle request/response operations.
2. WebSocket events handle real-time propagation.
3. All writes are validated server-side.
4. Client-provided role, nickname auth, queue state, or playback state must not be trusted.
5. Use idempotency keys for sensitive repeated actions where useful.

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

#### Nickname Endpoints

```http
POST /api/nicknames/check
POST /api/nicknames/protect
POST /api/nicknames/authenticate
POST /api/rooms/:roomId/join
POST /api/rooms/:roomId/nickname/change
```

`POST /api/rooms/:roomId/join` request:

```json
{
  "displayNickname": "DJ Fredo",
  "nicknamePassword": "optional-if-protected",
  "roomPassword": "optional-if-room-protected"
}
```

Response:

```json
{
  "session": {
    "roomSessionId": "uuid",
    "displayNickname": "DJ Fredo",
    "role": "participant",
    "protectedNickname": true
  },
  "websocketToken": "signed-token"
}
```

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

### 16.2 Client-to-Server Events

| Event                  | Purpose                         |
| ---------------------- | ------------------------------- |
| `chat.send`            | Send chat message.              |
| `queue.add`            | Add YouTube track.              |
| `queue.vote`           | Vote on queue item.             |
| `playback.skipVote`    | Vote to skip current track.     |
| `playback.clientState` | Report local player state.      |
| `presence.heartbeat`   | Maintain presence.              |
| `room.settings.update` | Host/mod setting update.        |
| `room.mechanic.change` | Host changes playlist mechanic. |
| `moderation.action`    | Host/mod action.                |

### 16.3 Server-to-Client Events

| Event                   | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `room.snapshot`         | Full room state after connect/reconnect. |
| `presence.updated`      | Participant list changed.                |
| `chat.message`          | New chat/system message.                 |
| `chat.deleted`          | Message deleted.                         |
| `queue.updated`         | Queue changed.                           |
| `queue.item.added`      | Track added.                             |
| `queue.item.removed`    | Track removed.                           |
| `queue.vote.updated`    | Vote count changed.                      |
| `playback.state`        | Current playback state.                  |
| `playback.resync`       | Client should seek/resync.               |
| `room.settings.changed` | Settings changed.                        |
| `room.mechanic.changed` | Playlist mechanic changed.               |
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

### 20.2 Controls

1. Required manual nickname before participation.
2. Nickname protection.
3. Chat rate limits.
4. Queue add rate limits.
5. Max video duration.
6. Duplicate prevention.
7. Vote limits per room session.
8. Host/mod tools.
9. Public-room cooldowns.
10. Audit logs.
11. Optional public-room report feature in Phase 2.

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

### 21.2 Data Not Collected in MVP

1. Email addresses.
2. Real names.
3. OAuth identities.
4. Payment information.
5. Uploaded audio files.
6. YouTube account credentials.

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

---

## 22. YouTube Integration Design

### 22.1 Playback

Use YouTube embedded player functionality for playback. The application should not download, proxy, extract, or re-stream audio/video content.

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

## 23. Error Handling

### 23.1 User-Facing Errors

| Scenario                          | Message Direction                                             |
| --------------------------------- | ------------------------------------------------------------- |
| Protected nickname wrong password | “That nickname is protected. The password was incorrect.”     |
| Nickname unavailable in room      | “Someone is already using that nickname in this room.”        |
| Video too long                    | “This video is longer than the room limit.”                   |
| Duplicate video                   | “That song is already in the queue.”                          |
| Video unavailable                 | “This video cannot be played here. Try another YouTube link.” |
| Queue locked                      | “The host has locked song additions.”                         |
| Muted                             | “You are muted in this room.”                                 |
| Rate limited                      | “You’re doing that too quickly. Try again shortly.”           |
| Mechanic change cooldown          | “Playlist mode was changed recently. Try again later.”        |

### 23.2 Server Error Principles

1. Do not leak internal stack traces.
2. Return structured error codes.
3. Log enough detail for debugging.
4. Avoid logging secrets, passwords, full tokens, or sensitive request bodies.

Example error response:

```json
{
  "error": {
    "code": "VIDEO_TOO_LONG",
    "message": "This video is longer than the room limit.",
    "details": {
      "maxDurationSeconds": 600
    }
  }
}
```

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

### 24.2 Logs

Use structured logs with:

1. Request ID.
2. Room ID.
3. Session ID hash.
4. Action type.
5. Error code.
6. Latency.
7. User agent class where helpful.

Do not log:

1. Plaintext passwords.
2. Full session tokens.
3. Host secrets.
4. Sensitive IP addresses unless required and protected.

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
8. Rate-limit calculations.
9. Mechanic change transition rules.

### 26.2 Integration Tests

Test:

1. Create room → join room → chat.
2. Join with unprotected nickname.
3. Protect nickname → rejoin with password.
4. Attempt protected nickname with wrong password.
5. Add YouTube URL → queue item created.
6. Current track ends → next track selected.
7. Host changes mechanic → current song unaffected.
8. Moderator removes queue item.
9. Muted participant cannot chat.
10. Banned participant cannot reconnect.

### 26.3 WebSocket Tests

Test:

1. Connect with valid token.
2. Reject invalid token.
3. Broadcast chat to room only.
4. Broadcast queue updates.
5. Reconnect and receive snapshot.
6. Presence heartbeat timeout.
7. Cross-instance event propagation.

### 26.4 End-to-End Tests

Test with Playwright or Cypress:

1. Two users join same room with different nicknames.
2. User A sends chat; User B sees it.
3. User A adds song; User B sees queue update.
4. Host changes playlist mechanic; both users see system message.
5. Protected nickname cannot be used by another user without password.

### 26.5 Load Tests

Scenarios:

1. 100 rooms with 10 users each.
2. 1 public room with 500 users.
3. Chat burst with rate limiting.
4. Queue voting burst.
5. WebSocket reconnect storm.

---

## 27. MVP Scope

### 27.1 MVP Must-Haves

1. Create room.
2. Join room with required manual nickname.
3. Optional protected nickname creation and authentication.
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

### 27.2 MVP Should-Haves

1. DJ rotation mode.
2. Skip voting.
3. Duplicate prevention.
4. Max duration setting.
5. Room-level queue lock.
6. Basic room setting history.
7. System chat messages.
8. Reconnect and room snapshot.

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

---

## 28. Open Questions

1. Should protected nicknames be global across the entire app or scoped to rooms? Recommended: global.
2. Should room host authority be based on host link, host password, protected nickname binding, or a combination? Recommended MVP: host link/session; Phase 2: bind to protected nickname.
3. Should temporary rooms expire after 7, 14, or 30 days of inactivity?
4. Should chat history be visible to users who join later?
5. Should public rooms appear in a directory in MVP or only later?
6. Should voting allow downvotes or only upvotes?
7. Should host-curated rooms allow participant suggestions by default?
8. How strict should nickname content moderation be?
9. What minimum password length should protected nicknames require?
10. What is the acceptable YouTube playback sync tolerance?

---

## 29. Recommended Product Decisions

1. **Require manual nickname entry before participation.** This is central to the product identity.
2. **Make nickname protection optional.** Do not force password creation.
3. **Warn clearly that nickname passwords cannot be recovered.** This avoids support expectations.
4. **Use global protected nicknames.** This makes identity meaningful across rooms.
5. **Let host change playlist mechanic later.** This is useful and should be supported.
6. **Do not interrupt current song when mechanic changes.** This avoids chaotic room behavior.
7. **Preserve existing queue by default.** This is the least surprising transition.
8. **Announce mechanic changes in chat.** Transparency prevents confusion.
9. **Start with URL paste, not in-app search.** It reduces API quota pressure and implementation complexity.
10. **Make public discovery a Phase 2 feature.** MVP should focus on room experience and moderation foundations.

---

## 30. Implementation Milestones

### Milestone 1: Foundation

1. Project setup.
2. Database schema.
3. Room creation.
4. Nickname join flow.
5. Session management.
6. WebSocket connection and room snapshot.

### Milestone 2: Chat and Presence

1. Real-time chat.
2. System messages.
3. Presence list.
4. Chat rate limiting.
5. Mute support.

### Milestone 3: YouTube Queue and Playback

1. YouTube URL parser.
2. Metadata fetch/cache.
3. Queue item creation.
4. YouTube player integration.
5. Playback state broadcast.
6. Track end/skip handling.

### Milestone 4: Playlist Mechanics

1. FIFO mode.
2. Voting mode.
3. Host-curated mode.
4. Mechanic change flow.
5. Queue transition policies.
6. System/audit messages.

### Milestone 5: Nickname Protection

1. Claim nickname.
2. Authenticate protected nickname.
3. Failed attempt rate limiting.
4. Protected nickname UI states.
5. Password warning and validation.

### Milestone 6: Moderation and Hardening

1. Ban support.
2. Remove queue item.
3. Delete chat message.
4. Duplicate prevention.
5. Max song duration.
6. Observability.
7. Terms/privacy/compliance review.

---

## 31. Acceptance Criteria

### 31.1 Room Creation

- A user can create a room without email or registration.
- A host session is established.
- A shareable room link is generated.
- Host can enter the room with a manually chosen nickname.

### 31.2 Room Join

- A visitor cannot chat, vote, or add songs before entering a nickname.
- The app never assigns a generic guest nickname.
- Protected nicknames require password authentication.
- Wrong protected nickname password is rejected and rate-limited.

### 31.3 Chat

- Participants can exchange real-time messages.
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

---

## 32. Risks and Mitigations

| Risk                            | Impact                        | Mitigation                                                        |
| ------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| YouTube API quota exhaustion    | Search/metadata features fail | Start with URL paste, cache metadata, monitor quota.              |
| YouTube embed restrictions      | Some videos fail to play      | Detect failures, mark failed, skip gracefully.                    |
| No-registration abuse           | Spam and impersonation        | Rate limits, protected nicknames, host moderation.                |
| Host link leaked                | Room takeover risk            | Host secret rotation in Phase 2, bind host to protected nickname. |
| Forgotten nickname passwords    | Support burden                | Clear warning; no recovery in MVP.                                |
| Public room moderation          | Toxic behavior                | Delay public directory until moderation tools mature.             |
| Playback sync drift             | Poor listening experience     | Periodic resync and server-authoritative state.                   |
| XSS via chat/nicknames/metadata | Security incident             | Escape output, sanitize input, CSP.                               |

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
| Skip vote threshold                 | 50% of active non-muted participants, minimum 2.    |
| Mechanic change cooldown            | None for private rooms; 5 minutes for public rooms. |
| Temporary room expiration           | 14 days after inactivity.                           |

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
    "maxSongDurationSeconds": 600
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

Build the MVP around three core pillars:

1. **Low-friction identity:** manual nicknames, optional password protection, no registration.
2. **Healthy collaborative rooms:** real-time chat, queue, voting/FIFO/host modes, and strong host moderation.
3. **Safe playlist flexibility:** host-selectable playlist mechanics that can be changed later without disrupting the current song or confusing participants.

The host should be allowed to set and later change the playlist mechanic, but the system must make that action transparent, reversible where possible, and non-disruptive by default. This gives rooms enough flexibility to evolve naturally while preserving trust among participants.
