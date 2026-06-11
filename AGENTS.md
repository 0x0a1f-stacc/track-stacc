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
- `POST /api/rooms/:roomId/listen` is implemented for creating read-only Listener sessions and listener-tier WebSocket tokens.
- Listener read-only enforcement for mutating REST routes and WebSocket C2S interactive events is implemented server-side via shared guard utilities (`apps/api/src/auth/guards.ts`, `apps/api/src/realtime/guards.ts`). Listener-tier writes return `403 LISTENER_READ_ONLY`. See Issue #41.
- Frontend Listener UI remains pending follow-up work.
- `QueueItemStatus.vetoed` and external integration tables (`site_integrations`, `external_participants`, etc.) are out of scope for native MVP — deferred to Issue #32.

## TypeScript Gotchas

- Shared base TS config enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; avoid passing explicit `undefined` for optional object properties.
- ESLint config treats `@typescript-eslint/no-explicit-any` as an error and `no-console` as a warning.
- `packages/types` source imports are extensionless so Next can transpile the workspace package; don't change them back to `.js` imports without checking the web build.
- `request.session` is typed as `RoomSession | undefined` via `apps/api/src/types/session.d.ts`. Use standard null checks instead of asserting existence.
- `WsTokenPayload` (in `apps/api/src/lib/tokens.ts`) now includes an optional `accessTier` field for encoding listener/member tier in signed WS tokens.

## Runtime Boundaries

- The API is authoritative for sessions, permissions, queue/playback state, nickname auth, and rate limits; never trust client role/playback/session signals.
- YouTube integration is metadata-only server-side plus client IFrame playback; do not download, proxy, cache, or re-stream audiovisual content.
- Passwords and room/host/nickname secrets use Argon2id wrappers in `apps/api/src/lib/argon2.ts`; do not introduce bcrypt or plaintext secrets.

## Config and Env Validation

- `app.config` is available in all Fastify routes and plugins (typed via `ApiConfig` interface).
- `loadConfig()` in `apps/api/src/lib/config.ts` validates and coerces all env vars. Do not read `process.env` directly in route/service code — use `app.config` or `request.config`.
- Required env vars (`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`) cause startup failure if absent. `YOUTUBE_API_KEY` is optional; `HOST_SECRET_SALT` is in `.env.example` but not consumed in current code.

## Request ID and Error Handling

- All API error responses include `requestId` from `request.id` (propagated from `X-Request-Id` header or generated by `nanoid`). Error responses also include `retryable` (boolean) and `retryAfterSeconds` (number or null).
- Socket.IO error events include a `ws_`-prefixed request ID via `generateEventRequestId()` and a `sourceEvent` field naming the client event that failed.
- Error codes must come from the formal registry in `apps/api/src/lib/error-codes.ts` (aligned with SDD §23.4). When adding a new error code, add it to both `ERROR_REGISTRY` and the SDD §23.4 table.
- The error envelope helpers are in `apps/api/src/lib/errors.ts`: `toErrorResponse()` for REST, `toWsErrorAcknowledgement()` for WebSocket acknowledgements.

## Frontend Notes

- Next config is `apps/web/next.config.mjs`; `next.config.ts` is not supported by this Next 14 setup.
- `apps/web/next.config.mjs` transpiles `@trackstacc/ui` and `@trackstacc/types`; keep this when changing package exports.

## Testing

- Tests live in `apps/api/src/__tests__/` and use Vitest; web has `--passWithNoTests` (no tests yet).
- API tests mock external dependencies (DB, Redis, Socket.IO broadcast) — no local services needed to run them.
- Run focused: `pnpm --filter api test`, `pnpm --filter web test`.
- Standalone nickname endpoint tests are in `apps/api/src/__tests__/nicknames.test.ts` (40+ tests covering check, protect, authenticate).
- Nickname auth rate limiting uses `assertRateLimit()` from `apps/api/src/lib/rateLimit.ts` with the `rateLimits.nicknameAuth` config.

## Environment & Services

- `YOUTUBE_API_KEY` is optional. When absent, tracks get partial metadata only (`durationSeconds=null`) and the playback fallback timer is skipped entirely — no auto-advance on track end.
- The API dev server loads `.env` via `dotenv` resolving `../../../.env` from the compiled source dir (`apps/api/src/main.ts:6`). Turbo does **not** propagate root `.env` to workspace packages, so the API must load it explicitly.
- Docker local services: Postgres 16 on `:5432`, Redis 7 on `:6379`. Full reset-and-start flow: `docker compose -f infra/docker-compose.yml down -v && docker compose -f infra/docker-compose.yml up -d && pnpm --filter api prisma migrate dev --name init && pnpm db:seed`.

## Route-Specific Room Resolution

- `/api/rooms/:roomId/join` and `/api/rooms/:roomId/password/verify` accept room slug **or** UUID.
- All other room routes (queue, playback, chat, moderation, settings) accept **UUID only**. Do not pass slugs to these routes.

## Realtime / Snapshot Notes

- `room.snapshot` is a server-to-client event typed in `packages/types/src/domain.ts` (`RoomSnapshot`). Emitted on every WebSocket connect after token validation.
- Socket.IO auth uses signed tokens from `apps/api/src/lib/tokens.ts`. The token is passed via `socket.handshake.auth.token` and validated in `apps/api/src/realtime/gateway.ts`.
- Invalid/missing/expired tokens are rejected with `WEBSOCKET_TOKEN_INVALID` (registered in `apps/api/src/lib/error-codes.ts`).
- WS event request IDs use `generateEventRequestId()` from `apps/api/src/realtime/request-id.ts` (`ws_`-prefixed).
- Listener snapshots respect `rooms.listener_chat_visible`: if false, `recentMessages` is `[]` for listener-tier sockets.
- Do not trust client role/access tier — the server re-derives the tier from the signed token on every connection.
- C2S interactive tier enforcement (chat.send, queue.add, etc.) is separate from snapshot delivery; do not mix unrelated enforcement into snapshot PRs.

## Migration First-Run

- `pnpm db:migrate` runs `prisma migrate dev`, which prompts for a migration name on first creation. For non-interactive first runs use: `pnpm --filter api prisma migrate dev --name init`.

## Build Dependencies

- `apps/api` build runs `prisma generate` (against the root schema) before `tsc`, because the Prisma client is generated at root but consumed by the API.
- Turbo `dev` tasks are `persistent: true` (long-running dev servers). Turbo `build` tasks depend on `^build` (package dependencies must build first).

## ESLint Debugging

When `pnpm lint` fails with errors at unexpected line numbers (e.g. lines 100+ in a 60-line file), do NOT assume the errors are pre-existing or belong to a different file. Turbo groups lint output by file — the error line numbers belong to the **last file path** printed before the errors, not files shown earlier without error details.

Root causes to check in order:

1. **Turbo cached stale dist/ output**: Run `rm -rf apps/api/dist .turbo apps/api/.turbo` and re-run lint without cache. ESLint v9 can pick up compiled `.js` files from `dist/` if they exist, reporting line numbers from those files.

2. **Errors are in YOUR file, not a pre-existing one**: When you see file paths grouped followed by errors, the errors belong to the LAST listed file. Read the error line number against YOUR newly created/modified file. Common real errors:
   - `no-unnecessary-type-assertion`: removing `as Type` casts or non-null `!` assertions that TypeScript already infers.
   - `no-unsafe-call` / `no-unsafe-member-access`: using `ReturnType<typeof Fastify>` instead of `FastifyInstance` (the former doesn't resolve properly for ESLint). Fix: use `import type { FastifyInstance } from "fastify"`.
   - `no-floating-promises`: Socket.IO's `Server.close()` returns `Promise<void>` (not `void`), so it must be `await`ed.
   - `exactOptionalPropertyTypes`: avoid `{ accessTier: overrides.accessTier }` when the value can be `undefined`. Use `...(overrides.accessTier !== undefined && { accessTier: overrides.accessTier })` pattern instead.

3. **Run eslint directly to isolate**: `cd apps/api && npx eslint "src/**/*.ts" --no-cache` runs without Turbo and shows precise errors with correct file attribution.

4. **Clear cache aggressively before trusting output**: `rm -rf .turbo apps/api/.turbo apps/web/.turbo apps/api/dist node_modules/.cache/eslint*` ensures no stale cache masks or misattributes errors.

## AI Engineering Documentation Protocol

Before implementing a feature, changing an API, modifying schema, changing WebSocket behavior, or altering security/permissions:

1. Read `docs/ai/trackstacc-ai-reference.md`.
2. Read `docs/ai/trackstacc-ai-index.md`.
3. Use `docs/ai/trackstacc-agent-playbooks.md` to choose task-specific docs.
4. For implementation-impact questions, read:
   - `docs/ai/trackstacc-change-impact-matrix.md`
   - `docs/ai/trackstacc-feature-maps.md`
   - `docs/ai/trackstacc-integration-matrix.md`
5. For schema/API/event work, read:
   - `docs/ai/trackstacc-requirements-graph.md`
   - `docs/ai/trackstacc-integration-matrix.md`
6. For auth, permissions, moderation, abuse prevention, or nickname protection, read:
   - `docs/ai/trackstacc-security-controls.md`
   - `docs/ai/trackstacc-change-impact-matrix.md`
7. Read the full `docs/sdd.md` only when the derived AI docs do not answer the question or when exact source wording is required.

Every implementation plan should name the relevant stable IDs, affected files, commands to run, and whether the SDD-derived docs need updating.
