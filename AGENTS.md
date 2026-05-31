# AGENTS.md

## Repo Shape

- pnpm workspace pinned to `pnpm@9.15.4`; packages are only `apps/*` and `packages/*`.
- Main apps: `apps/api` is Fastify + Socket.IO; `apps/web` is Next.js 14 App Router.
- Shared packages: `packages/types` owns API/domain/WebSocket contracts; `packages/ui` owns Tailwind React primitives; `packages/config` owns shared TS/ESLint/Tailwind config.
- Prisma schema and seed live at root `prisma/`, not under `apps/api`.

## Commands

- Install: `pnpm install --config.confirmModulesPurge=false`.
- Full verification: `pnpm typecheck && pnpm test && pnpm build`.
- Focused package commands: `pnpm --filter api test`, `pnpm --filter api typecheck`, `pnpm --filter web typecheck`, `pnpm --filter web build`.
- API Prisma commands must go through the API wrapper: `pnpm --filter api prisma validate`, `pnpm --filter api prisma generate`, `pnpm db:migrate`, `pnpm db:seed`.
- Local services are from `infra/docker-compose.yml`: `docker compose -f infra/docker-compose.yml up -d` starts Postgres on `5432` and Redis on `6379`.

## Prisma And Env

- `DATABASE_URL` is required by Prisma; `.env.example` uses `postgresql://trackstacc:trackstacc@localhost:5432/trackstacc`.
- Root `devDependencies` include Prisma packages so `prisma/schema.prisma` can generate reliably from the root schema location.
- `apps/api/scripts/prisma.mjs` appends `--schema ../../prisma/schema.prisma`; do not duplicate schema flags before the Prisma subcommand.
- API readiness (`/health/ready`) requires both PostgreSQL and Redis connections.

## TypeScript Gotchas

- Shared base TS config enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; avoid passing explicit `undefined` for optional object properties.
- ESLint config treats `@typescript-eslint/no-explicit-any` as an error and `no-console` as a warning.
- `packages/types` source imports are extensionless so Next can transpile the workspace package; don’t change them back to `.js` imports without checking the web build.

## Runtime Boundaries

- The API is authoritative for sessions, permissions, queue/playback state, nickname auth, and rate limits; never trust client role/playback/session signals.
- YouTube integration is metadata-only server-side plus client IFrame playback; do not download, proxy, cache, or re-stream audiovisual content.
- Passwords and room/host/nickname secrets use Argon2id wrappers in `apps/api/src/lib/argon2.ts`; do not introduce bcrypt or plaintext secrets.

## Frontend Notes

- Next config is `apps/web/next.config.mjs`; `next.config.ts` is not supported by this Next 14 setup.
- `apps/web/next.config.mjs` transpiles `@trackstacc/ui` and `@trackstacc/types`; keep this when changing package exports.
