# AGENTS.md

## Repo Map

Run `docs/dev/repo-map.md` is the canonical repository baseline and command reference. Read it before guessing workspace paths, package names, or commands.

## Repo Shape

- pnpm workspace pinned to `pnpm@9.15.4`; packages are only `apps/*` and `packages/*`.
- Main apps: `apps/api` is Fastify + Socket.IO; `apps/web` is Next.js 14 App Router.
- Shared packages: `packages/types` owns API/domain/WebSocket contracts; `packages/ui` owns Tailwind React primitives; `packages/config` owns shared TS/ESLint/Tailwind config.
- Prisma schema and seed live at root `prisma/`, not under `apps/api`.

## Commands

- Install: `pnpm install --config.confirmModulesPurge=false` (local) or `pnpm install --frozen-lockfile` (CI).
- Full verification: `pnpm typecheck && pnpm test && pnpm build`.
- Focused package commands: `pnpm --filter api test`, `pnpm --filter api typecheck`, `pnpm --filter web typecheck`, `pnpm --filter web build`.
- API Prisma commands must go through the API wrapper: `pnpm --filter api prisma validate`, `pnpm --filter api prisma generate`, `pnpm db:migrate`, `pnpm db:seed`.
- Local services are from `infra/docker-compose.yml`: `docker compose -f infra/docker-compose.yml up -d` starts Postgres on `5432` and Redis on `6379`.

## CI and Env Validation

- CI runs on every PR via `.github/workflows/ci.yml`: install → prisma validate → lint → typecheck → test (Postgres + Redis service containers) → build.
- CI install uses `--frozen-lockfile`; local dev uses `--config.confirmModulesPurge=false`.
- Required env vars (`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`) cause startup failure with a descriptive error if absent. Validation in `apps/api/src/lib/env.ts`, called from `main()`.
- `HOST_SECRET_SALT` is in `.env.example` but not validated at startup — not consumed in current code.
- `YOUTUBE_API_KEY` is optional; absence yields `metadataStatus: "partial"` for tracks.
- `turbo.json` `build` and `test` tasks include `env` cache keys for `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `HOST_SECRET_SALT`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `YOUTUBE_API_KEY`. Changing these env vars locally busts the Turbo cache.

## Prisma And Env

- `DATABASE_URL` is required by Prisma; `.env.example` uses `postgresql://trackstacc:trackstacc@localhost:5432/trackstacc`.
- Root `devDependencies` include Prisma packages so `prisma/schema.prisma` can generate reliably from the root schema location.
- `apps/api/scripts/prisma.mjs` appends `--schema ../../prisma/schema.prisma`; do not duplicate schema flags before the Prisma subcommand.
- API readiness (`/health/ready`) requires both PostgreSQL and Redis connections.

## Native Access Tier Schema

- `room_sessions.access_tier` exists (enum `AccessTier`: `listener` | `member`), defaults to `listener`.
- `rooms.listener_chat_visible` exists (boolean), defaults to `false`.
- `Role.listener` exists alongside `participant`, `moderator`, `host`.
- `RoomSession.normalizedNickname` and `RoomSession.displayNickname` are **nullable** — listeners have no nickname.
- Existing member/host session creation must explicitly set `accessTier: "member"` (the DB default is `listener`).
- Never auto-generate `guest_1234`-style names for listeners.
- Listener `/listen` endpoint, read-only API/WebSocket enforcement, and UI are pending follow-up work.
- `QueueItemStatus.vetoed` and external integration tables (`site_integrations`, `external_participants`, etc.) are out of scope for native MVP — deferred to Issue #32.

## TypeScript Gotchas

- Shared base TS config enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; avoid passing explicit `undefined` for optional object properties.
- ESLint config treats `@typescript-eslint/no-explicit-any` as an error and `no-console` as a warning.
- `packages/types` source imports are extensionless so Next can transpile the workspace package; don't change them back to `.js` imports without checking the web build.

## Runtime Boundaries

- The API is authoritative for sessions, permissions, queue/playback state, nickname auth, and rate limits; never trust client role/playback/session signals.
- YouTube integration is metadata-only server-side plus client IFrame playback; do not download, proxy, cache, or re-stream audiovisual content.
- Passwords and room/host/nickname secrets use Argon2id wrappers in `apps/api/src/lib/argon2.ts`; do not introduce bcrypt or plaintext secrets.

## Frontend Notes

- Next config is `apps/web/next.config.mjs`; `next.config.ts` is not supported by this Next 14 setup.
- `apps/web/next.config.mjs` transpiles `@trackstacc/ui` and `@trackstacc/types`; keep this when changing package exports.

## Testing

- Tests live in `apps/api/src/__tests__/` and use Vitest; web has `--passWithNoTests` (no tests yet).
- API tests mock external dependencies (DB, Redis, Socket.IO broadcast) — no local services needed to run them.
- Run focused: `pnpm --filter api test`, `pnpm --filter web test`.

## Environment & Services

- `YOUTUBE_API_KEY` is optional. When absent, tracks get partial metadata only (`durationSeconds=null`) and the playback fallback timer is skipped entirely — no auto-advance on track end.
- The API dev server loads `.env` via `dotenv` resolving `../../../.env` from the compiled source dir (`apps/api/src/main.ts:6`). Turbo does **not** propagate root `.env` to workspace packages, so the API must load it explicitly.
- Docker local services: Postgres 16 on `:5432`, Redis 7 on `:6379`. Full reset-and-start flow: `docker compose -f infra/docker-compose.yml down -v && docker compose -f infra/docker-compose.yml up -d && pnpm --filter api prisma migrate dev --name init && pnpm db:seed`.

## Route-Specific Room Resolution

- `/api/rooms/:roomId/join` and `/api/rooms/:roomId/password/verify` accept room slug **or** UUID.
- All other room routes (queue, playback, chat, moderation, settings) accept **UUID only**. Do not pass slugs to these routes.

## Migration First-Run

- `pnpm db:migrate` runs `prisma migrate dev`, which prompts for a migration name on first creation. For non-interactive first runs use: `pnpm --filter api prisma migrate dev --name init`.

## Build Dependencies

- `apps/api` build runs `prisma generate` (against the root schema) before `tsc`, because the Prisma client is generated at root but consumed by the API.
- Turbo `dev` tasks are `persistent: true` (long-running dev servers). Turbo `build` tasks depend on `^build` (package dependencies must build first).
