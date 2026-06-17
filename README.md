# trackstacc.live

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Collaborative YouTube music rooms built as a pnpm workspace with a Next.js web app, a Fastify + Socket.IO API, PostgreSQL, and Redis.

## What This Repo Contains

- `apps/web`: Next.js 14 App Router frontend
- `apps/api`: Fastify API, Socket.IO gateway, Prisma access, Redis-backed state
- `packages/types`: shared domain, REST, and WebSocket contracts
- `packages/ui`: shared React UI primitives
- `packages/config`: shared TypeScript, ESLint, and Tailwind config
- `prisma/`: root Prisma schema, migrations, and seed
- `infra/`: local and production Docker Compose files

## Current Product Scope

Implemented and exercised locally:

- room creation with host cookie
- nickname-based room join with session cookie + WebSocket token
- protected nicknames with Argon2id password verification
- shared queue add/remove/vote flows
- suggestions flow with approve/reject endpoints
- room settings persistence for queue/chat lock and other room options
- Socket.IO room snapshot on connect (includes access tier, nullable listener nicknames, and listener chat visibility filtering)
- health and readiness endpoints
- Docker builds for both API and web
- Listener-to-member join upgrade via `POST /api/rooms/:roomId/join` with `listenerSessionId` — upgrades a Listener session to `member` in place with a replacement WebSocket token carrying `accessTier: "member"`
- Listener UI for read-only room shell implemented; WebSocket C2S and REST access-tier enforcement implemented server-side (Issue #41) — Listener-tier interactive writes return `403 LISTENER_READ_ONLY`
- REST chat-history fetch respects room-scoped session validation and listener visibility settings, returning empty messages for listeners by default

Backend support exists for moderation, playback coordination, and multiple queue mechanics. The frontend is still lighter than the backend surface area, so not every API capability is exposed in the UI yet.

## Tech Stack

| Layer                         | Technology                                          |
| ----------------------------- | --------------------------------------------------- |
| Frontend                      | Next.js 14, React 18, TypeScript, Tailwind CSS      |
| Backend                       | Fastify 5, TypeScript, Socket.IO                    |
| Data                          | PostgreSQL, Prisma                                  |
| Cache / realtime coordination | Redis, `ioredis`, Socket.IO Redis adapter           |
| Auth / secrets                | httpOnly cookies, signed WebSocket tokens, Argon2id |
| Monorepo tooling              | pnpm workspaces, Turborepo                          |
| Deployment                    | Docker Compose, Coolify                             |

## Quick Start

### Prerequisites

- Node.js 20+
- Corepack-enabled pnpm 9.15.4
- Docker with Compose
- YouTube Data API v3 key

### 1. Install dependencies

```bash
pnpm install --config.confirmModulesPurge=false
```

### 2. Configure environment

```bash
cp .env.example .env
```

Minimum values to set:

- `DATABASE_URL`
- `REDIS_URL`
- `YOUTUBE_API_KEY`
- `SESSION_SECRET`
- `HOST_SECRET_SALT`

For local development, `.env.example` already points Postgres to `localhost:5432` and Redis to `localhost:6379`.

### 3. Start local services

```bash
docker compose -f infra/docker-compose.yml up -d
```

This starts:

- PostgreSQL 16 on `localhost:5432`
- Redis 7 on `localhost:6379`

### 4. Create and apply the first migration

The root `db:migrate` script uses `prisma migrate dev`, which is interactive when a new migration must be named.

For the first run, use an explicit migration name:

```bash
pnpm --filter api prisma migrate dev --name init
```

After that, seed the local database:

```bash
pnpm db:seed
```

### 5. Start the apps

```bash
pnpm dev
```

Default URLs:

- web: `http://localhost:3000`
- api: `http://localhost:4000`

## Verification Commands

Full repo checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Focused commands:

```bash
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
pnpm test:e2e
pnpm --filter api prisma validate
```

A detailed command reference with prerequisites, package scripts, and verification notes lives at `docs/dev/repo-map.md`.

These same commands run automatically on every pull request via `.github/workflows/ci.yml` with Postgres 16 and Redis 7 service containers.

Database helpers:

```bash
pnpm db:migrate
pnpm db:push
pnpm db:seed
pnpm db:studio
```

Note: Prisma commands should go through the API package wrapper so they use the root schema path correctly.

## Local Runtime Checks

These were verified against Docker-backed Postgres and Redis:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/ready
```

Expected response:

```json
{ "ok": true }
```

Also verified locally:

- `POST /api/rooms` creates a room
- `POST /api/rooms/:slug/join` returns a session payload and `websocketToken`; accepts optional `listenerSessionId` to upgrade a listener session in place to `member`, returning a replacement `websocketToken` with `accessTier: "member"`
- `POST /api/rooms/:roomId/listen` serves as the room bootstrap and same-session rehydration path; returns a listener or rehydrated member/host session payload and a fresh `websocketToken` based on the active browser session cookie
- Socket.IO connection receives `room.snapshot` (includes room metadata, playback, queue, participants, and recent messages filtered by access tier)

## Environment Variables

See `.env.example` for the full list. Important ones:

| Variable              | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string used by Prisma and API |
| `REDIS_URL`           | Redis connection string                             |
| `YOUTUBE_API_KEY`     | server-side YouTube metadata API key                |
| `SESSION_SECRET`      | signing secret for session and WS token flows       |
| `HOST_SECRET_SALT`    | secret material for host token hashing              |
| `NEXT_PUBLIC_API_URL` | frontend REST base URL                              |
| `NEXT_PUBLIC_WS_URL`  | frontend Socket.IO base URL                         |
| `CORS_ORIGINS`        | comma-separated allowed origins for API CORS        |

## API Notes

The API is authoritative for:

- room membership and roles
- nickname protection and authentication
- queue writes and voting
- playback state
- rate limits
- moderation state

Important endpoints:

- `POST /api/nicknames/check` — check nickname availability and protection status; returns normalized nickname, whether it is protected, and availability. Passwords and hashes are never returned.
- `POST /api/nicknames/protect` — claim a protected nickname with a password; stores only an Argon2id password hash, never plaintext. Returns the claim `id` and `displayNickname`.
- `POST /api/nicknames/authenticate` — authenticate against an existing protected nickname. Failed attempts are rate-limited (Redis-backed, configurable). Returns `NICKNAME_PASSWORD_INCORRECT` for unknown or wrong passwords (no user enumeration).
- `POST /api/rooms`
- `GET /api/rooms/:roomId`
- `PATCH /api/rooms/:roomId/settings`
- `POST /api/rooms/:roomId/join` — room join with optional protect-and-join; accepts optional `listenerSessionId` to upgrade an existing Listener session to `member` in place; returns a replacement `websocketToken` with `accessTier: "member"`; separate from the standalone nickname endpoints above
- `POST /api/rooms/:roomId/listen` — room bootstrap and same-session rehydration endpoint; returns a listener or rehydrated member/host session payload and a fresh `websocketToken` based on the active browser session cookie
- `POST /api/rooms/:roomId/password/verify`
- `POST /api/rooms/:roomId/queue/items`
- `POST /api/rooms/:roomId/queue/items/:queueItemId/vote`
- `POST /api/rooms/:roomId/queue/items/:queueItemId/approve`
- `POST /api/rooms/:roomId/queue/items/:queueItemId/reject`
- `POST /api/rooms/:roomId/playback/skip`
- `GET /api/rooms/:roomId/chat/messages` — retrieve chat history; respects room-scoped session validation and listener visibility (`listenerChatVisible` settings)
- `DELETE /api/rooms/:roomId/chat/messages/:messageId` — soft delete a chat message (moderator/host only)
- `GET /health`
- `GET /health/ready`

Most write routes require the `session_token` cookie set during room join or listen. After obtaining a `websocketToken` from join or listen, clients connect to the Socket.IO gateway which validates the token, joins the room channel, and emits `room.snapshot` with room metadata, current playback, queue, participants, and recent messages allowed for the access tier.

## Queue Mechanics

The schema and backend support these mechanics:

- `fifo`
- `voting`
- `dj_rotation`
- `host_curated`
- `suggestions`

Suggestions are represented as `suggested` queue items until a host or moderator approves or rejects them.

## Security Model

- no client role or playback state is trusted
- password hashing uses Argon2id
- session auth uses httpOnly cookies
- WebSocket auth uses signed short-lived tokens
- request validation uses Zod
- write actions are rate-limited in Redis
- YouTube integration is metadata-only on the server and IFrame-based on the client

## Docker And Deployment

Local development services:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Production image build:

```bash
docker compose -f infra/docker-compose.prod.yml build
```

The production compose file expects environment values for database, Redis, API secrets, CORS, and the public frontend URLs. `infra/coolify/coolify.env.example` documents those values for Coolify.

## Known Repo Quirks

- `prisma/schema.prisma` is at the repo root, not under `apps/api`
- Prisma packages are intentionally present at the workspace root so generation works from the root schema location
- `apps/web/next.config.mjs` must stay `.mjs`; Next 14 in this repo does not use `next.config.ts`
- `packages/types` uses extensionless source imports so the web app can transpile the workspace package correctly

## License

MIT — see the [LICENSE](LICENSE) file for details.

## Reference Docs

- `docs/sdd.md`
- `docs/dev/repo-map.md` (canonical workspace layout, command reference, and known gaps)
- `AGENTS.md`
- `infra/coolify/coolify.env.example`
