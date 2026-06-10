# Repository Map

**trackstacc.live** — collaborative YouTube music rooms (pnpm monorepo).

## Quick Start

```bash
pnpm install --config.confirmModulesPurge=false
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

No `.env`, Docker, or secrets needed — all four verification commands run offline.

---

## Workspace Map

| Path | `name` | Purpose | Has scripts |
|------|--------|---------|-------------|
| `apps/api` | `api` | Fastify 5 API, Socket.IO, Prisma, Redis | `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `prisma` |
| `apps/web` | `web` | Next.js 14 App Router frontend | `dev`, `build`, `start`, `typecheck`, `lint`, `test` |
| `packages/types` | `@trackstacc/types` | Shared API/domain/WebSocket contracts | `build`, `typecheck`, `lint`, `test` |
| `packages/ui` | `@trackstacc/ui` | Shared React + Tailwind primitives | `build`, `typecheck`, `lint`, `test` |
| `packages/config` | `@trackstacc/config` | Shared TS/ESLint/Tailwind config | *(none — pure config package)* |

`packages/config` has **no** `lint`, `typecheck`, `test`, or `build` scripts — Turbo skips it for those tasks.

### Other top-level directories

| Path | Purpose |
|------|---------|
| `prisma/` | Root Prisma schema (`schema.prisma`), migrations, seed |
| `infra/` | Docker Compose files (`docker-compose.yml`, `docker-compose.prod.yml`) and Coolify env example |
| `docs/` | Product and engineering documentation |
| `.github/` | PR template and validation workflow |

### Key infrastructure files

| Path | Purpose |
|------|---------|
| `apps/api/src/lib/config.ts` | Typed config loader — `ApiConfig` interface, `loadConfig()`, `createConfigPlugin()` |
| `apps/api/src/lib/error-codes.ts` | Formal error code registry aligned with SDD §23.4 |
| `apps/api/src/lib/errors.ts` | Error envelope helpers — `AppError`, `toErrorResponse()`, `toWsErrorAcknowledgement()` |
| `apps/api/src/types/config.d.ts` | Fastify type augmentation for `app.config` |
| `apps/api/src/types/session.d.ts` | Fastify type augmentation for `request.session` |
| `apps/api/src/realtime/request-id.ts` | WebSocket event request ID generation (`ws_`-prefixed)
`apps/api/src/realtime/gateway.ts` | Socket.IO connection handler — token validation, room join, snapshot emission
`apps/api/src/realtime/room.gateway.ts` | Client-to-server event handlers (chat, queue, playback, moderation)
`apps/api/src/realtime/broadcast.ts` | Socket.IO room channel helpers and broadcast utilities
`apps/api/src/realtime/presence.manager.ts` | Presence tracking and participant snapshot assembly |

---

## Package Graph

```
@trackstacc/config          — shared config only (no internal deps)
    ▲
    │ devDependency
    │
@trackstacc/types           — repository-level contracts (rest, domain, events)
@trackstacc/ui              — React components (peer: react)
    ▲                           ▲
    │ dependency                │ dependency
    │                           │
apps/api (Fastify 5)       apps/web (Next.js 14)
    │                           │
    └── @trackstacc/types        └── @trackstacc/types
    └── @trackstacc/config       └── @trackstacc/ui
         (devDep)                └── @trackstacc/config (devDep)
```

**Edge:** `apps/web` depends on both `@trackstacc/types` (runtime) and `@trackstacc/ui` (runtime).
`apps/api` depends only on `@trackstacc/types` (runtime).

### Key file: standalone nickname endpoints

Standalone protected-nickname endpoints (`POST /api/nicknames/check`, `/protect`, `/authenticate`) are implemented in `apps/api/src/modules/nicknames/` and consumed by the room join flow in `apps/api/src/modules/identity/`. Tests cover normalization, hash-only password storage, reserved-name blocking, wrong-password denial, and failed-attempt rate limiting. Test file: `apps/api/src/__tests__/nicknames.test.ts`.

---

## Command Reference

### Verification commands (finite, no prerequisites)

| Command | Duration | Requires `.env` | Requires Docker | Notes |
|---------|----------|----------------|----------------|-------|
| `pnpm install --config.confirmModulesPurge=false` | ~1s (cached) | No | No | Corepack-enforced pnpm 9.15.4. Does not modify lockfile on reinstall. CI uses `pnpm install --frozen-lockfile`. |
| `pnpm lint` | ~5s | No | No | 5 packages; `packages/config` skipped (no lint script). |
| `pnpm typecheck` | ~2s (cached) | No | No | 4 packages with TypeScript; `packages/config` skipped. |
| `pnpm test` | ~1.5s | No | No | 40+ tests (Vitest) across 17 files in `apps/api`; `web`/`types`/`ui` pass with no test files. |
| `pnpm build` | ~16s (cached) | No | No | Prisma generate → `tsc` for `api`; `next build` for `web`; `tsc` for `types` and `ui`. |
| `pnpm --filter api prisma validate` | ~2s | No (fallback DATABASE_URL in wrapper) | No | Validates root schema via `apps/api/scripts/prisma.mjs`. |
| `pnpm --filter api prisma generate` | ~2s | No (fallback DATABASE_URL in wrapper) | No | Generates Prisma Client from root schema. |

### Verification results (2026-06-08)

| Command | Result |
|---------|--------|
| `pnpm lint` | ✓ All 5 packages clean |
| `pnpm typecheck` | ✓ 4 packages clean |
| `pnpm test` | ✓ 30+ tests (16 files), all pass |
| `pnpm build` | ✓ 4 packages, Next.js generates 6 static + 2 dynamic routes |
| `pnpm --filter api prisma validate` | ✓ Schema valid |
| `pnpm --filter api prisma generate` | ✓ Prisma Client generated |
| `docker compose -f infra/docker-compose.yml config` | ✓ Valid — Postgres 16 on `:5432`, Redis 7 on `:6379` |
| `docker compose -f infra/docker-compose.prod.yml config` | ✓ Valid — warns about unset env vars (expected) |

### Persisent/startup commands

| Command | Requires `.env` | Requires Docker | Notes |
|---------|----------------|----------------|-------|
| `pnpm dev` | Yes (for full behavior) | Yes (Postgres + Redis) | Starts both `api` and `web` dev servers via Turbo. Persistent — use `Ctrl+C`. |
| `docker compose -f infra/docker-compose.yml up -d` | No | Yes (Docker Engine) | Starts Postgres + Redis. Detached mode. |
| `pnpm db:migrate` | Yes (DATABASE_URL) | Yes (Postgres) | **Interactive** on first run; see Prisma Command Flow below. |
| `pnpm db:seed` | Yes (DATABASE_URL) | Yes (Postgres) | Seeds database with sample data. |

### Database helper commands

```bash
pnpm db:migrate         # prisma migrate dev (interactive on first run)
pnpm db:push            # prisma db push
pnpm db:seed            # prisma db seed
pnpm db:studio          # prisma studio (opens Prisma Studio in browser)
```

---

## CI Pipeline

Workflow: `.github/workflows/ci.yml` — runs on `pull_request` (all branches) and `push` to `main`.

| Stage | Command(s) | Requires DB/Redis | Notes |
|-------|-----------|-------------------|-------|
| Setup | `actions/checkout@v4`, `actions/setup-node@v4` (Node 20), Corepack, `pnpm install --frozen-lockfile` | No | Node 20; `--frozen-lockfile` ensures lockfile consistency |
| Prisma validate | `pnpm --filter api prisma validate` | No | Schema-only; wrapper fallback DATABASE_URL used |
| Lint + typecheck | `pnpm lint`, `pnpm typecheck` | No | `packages/config` skipped (no scripts) |
| Test | `pnpm --filter api prisma migrate deploy`, `pnpm test` | Yes — Postgres 16 + Redis 7 | Service containers with health checks; credentials: `trackstacc:trackstacc@localhost:5432/trackstacc` |
| Build | `pnpm build` | No | `prisma generate` (schema-only) runs before `tsc` for api |

SDD §39.1 Stage 5 (deploy) is not yet implemented.

---

## Focused Package Commands

### API

```bash
pnpm --filter api lint          # eslint src --ext .ts
pnpm --filter api typecheck     # tsc -p tsconfig.json --noEmit
pnpm --filter api test          # vitest run
pnpm --filter api build         # prisma generate && tsc
```

### Web

```bash
pnpm --filter web lint          # next lint
pnpm --filter web typecheck     # tsc -p tsconfig.json --noEmit
pnpm --filter web test          # vitest run --passWithNoTests
pnpm --filter web build         # next build
```

### `@trackstacc/types`

```bash
pnpm --filter @trackstacc/types lint        # eslint src --ext .ts
pnpm --filter @trackstacc/types typecheck   # tsc -p tsconfig.json --noEmit
pnpm --filter @trackstacc/types test        # vitest run --passWithNoTests
pnpm --filter @trackstacc/types build       # tsc
```

### `@trackstacc/ui`

```bash
pnpm --filter @trackstacc/ui lint           # eslint src --ext .ts,.tsx
pnpm --filter @trackstacc/ui typecheck      # tsc -p tsconfig.json --noEmit
pnpm --filter @trackstacc/ui test           # vitest run --passWithNoTests
pnpm --filter @trackstacc/ui build          # tsc
```

### `@trackstacc/config`

**No scripts.** A pure shared-config package that exports `tsconfig.base.json`, `eslint.config.base.js`, and Tailwind presets. No build/typecheck/lint/test needed.

---

## Prisma Command Flow

```
root $ pnpm db:migrate
  → pnpm --filter api prisma migrate dev
    → node apps/api/scripts/prisma.mjs migrate dev
      → execFileSync("prisma", ["migrate", "dev", "--schema", "../../prisma/schema.prisma"])
```

### Key rules

| Rule | Detail |
|------|--------|
| **Schema path** | `prisma/schema.prisma` (root, **not** under `apps/api`) |
| **Wrapper** | `apps/api/scripts/prisma.mjs` |
| **Auto-append schema** | The wrapper appends `--schema ../../prisma/schema.prisma` automatically. **Do not** manually add `--schema` flags before the Prisma subcommand. |
| **First migration** | `pnpm db:migrate` is **interactive** on first run (prompts for migration name). Use `pnpm --filter api prisma migrate dev --name init` for non-interactive first-run. |
| **Validate** | `pnpm --filter api prisma validate` |
| **Generate** | `pnpm --filter api prisma generate` |
| **Fallback DATABASE_URL** | The wrapper defaults to `postgresql://trackstacc:trackstacc@localhost:5432/trackstacc` when `DATABASE_URL` is unset. This makes `validate`/`generate` work without `.env` but may mask a missing database connection. |
| **Prisma version** | 6.19.3 (current); Prisma 7 available as major upgrade |

---

## Local Services and Environment

### Prerequisites

- **Node.js 20+** — enforced via `engines.node: >=20.0.0` in root `package.json` and `actions/setup-node@v4` in CI.
- **pnpm 9.15.4** — pinned via `packageManager` in root `package.json`; Corepack-enabled.

### Docker Compose

```bash
# Start local Postgres + Redis
docker compose -f infra/docker-compose.yml up -d

# Verify configuration (no containers needed)
docker compose -f infra/docker-compose.yml config
docker compose -f infra/docker-compose.prod.yml config
```

### Expected service ports

| Service | Port | Image |
|---------|------|-------|
| PostgreSQL 16 | `localhost:5432` | `postgres:16-alpine` |
| Redis 7 | `localhost:6379` | `redis:7-alpine` |

### Full local reset

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
pnpm --filter api prisma migrate dev --name init
pnpm db:seed
```

### Dev server URLs

| App | URL |
|-----|-----|
| Web | `http://localhost:3000` |
| API | `http://localhost:4000` |

### Health checks

```bash
curl http://localhost:4000/health       # basic liveness
curl http://localhost:4000/health/ready # checks Postgres + Redis
```

Expected response:

```json
{ "ok": true }
```

### Environment variables

| Variable | Required? | Purpose | Validated at startup? |
|----------|-----------|---------|----------------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | Yes — startup fails if absent |
| `REDIS_URL` | Yes | Redis connection string | Yes — startup fails if absent |
| `SESSION_SECRET` | Yes | Signing key for session and WS tokens | Yes — startup fails if absent |
| `HOST_SECRET_SALT` | Yes (in .env.example) | Salt for host token hashing | No — not consumed in current code |
| `CORS_ORIGINS` | Yes | Comma-separated allowed CORS origins | No — defaults to `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | Yes (web build) | Frontend REST base URL | No — build-time only |
| `NEXT_PUBLIC_WS_URL` | Yes (web build) | Frontend Socket.IO base URL | No — build-time only |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 key. When absent, tracks get partial metadata only (`durationSeconds=null`) and the playback fallback timer is skipped. | No — graceful degradation to `metadataStatus: "partial"` |

### Env loading

The API loads `.env` from the root directory using `dotenv` at `apps/api/src/main.ts:6`
(resolves to `../../../.env` from the compiled `dist/` path). Turbo does **not**
automatically propagate root `.env` to workspace packages, so the API loads it explicitly.

Web `NEXT_PUBLIC_*` variables are **build-time** — set them before `pnpm build`
or pass them via Docker build args.

---

## Runtime Boundaries

| Layer | Owns | Does not own |
|-------|------|-------------|
| **API** (`apps/api`) | Sessions, permissions, queue/playback state, nickname auth, moderation, rate limits, YouTube metadata | Frontend rendering, client state, YouTube IFrame playback decisions |
| **Web** (`apps/web`) | UI rendering, YouTube IFrame player, local state, Socket.IO connection | Server-side authority; never trust client role/playback/session signals |
| **`@trackstacc/types`** (`packages/types`) | Shared API/domain/WebSocket TypeScript contracts | Runtime logic |
| **`@trackstacc/ui`** (`packages/ui`) | Shared React UI primitives | Business logic, API calls, state management |
| **`@trackstacc/config`** (`packages/config`) | Shared TS/ESLint/Tailwind configuration | Application code |
| **Prisma** (`prisma/schema.prisma`) | Durable schema, migrations, seed data | Application state; Prisma Client is generated to `node_modules` |
| **Redis** | Rate limits, Socket.IO pub/sub adapter, presence | Durable state; stateless for reads |

### Developer rules

1. **Never trust client state** — the API is authoritative for all session, permission, queue, playback, and moderation decisions.
2. **Prisma schema is at root** — do not create `prisma/` under `apps/api`.
3. **Extensionless imports** — `packages/types` source imports do not use `.js` extensions (required for Next.js transpilation).
4. **`next.config.mjs` must stay `.mjs`** — this repo does not use `next.config.ts`.
5. **no-explicit-any is an error** — ESLint enforces this across all packages.
6. **no-console is a warning** — use structured logging via Fastify's `request.log` or Pino.
7. **Argon2id only** — passwords use `apps/api/src/lib/argon2.ts`. Never introduce bcrypt or plaintext.

---

## Known Gaps and Mismatches

| Gap | Affects | Notes |
|-----|---------|-------|
| **SDD says `/api/v1/`, code uses `/api/`** | API conventions | SDD §15.1.1 specifies `/api/v1/` prefix. Actual routes use bare `/api/`. README and `AGENTS.md` correctly document `/api/`. |
| **Listener tier not fully implemented** | Product scope | SDD v1.4.0 specifies two-tier native access (`listener`/`member`), `/listen` endpoint, `access_tier` field, and `listener_chat_visible`. **Schema and shared contracts are implemented** (`AccessTier` enum, `room_sessions.access_tier`, `rooms.listener_chat_visible`, nullable nickname fields, `Role.listener`). `POST /api/rooms/:roomId/listen` creates read-only listener sessions. Listener read-only API enforcement, member upgrade, and frontend Listener UI remain pending follow-up work. |
| **`HOST_SECRET_SALT` unused** | API config | `.env.example` lists it as required. Config loader surfaces it but no code consumes it yet. Likely reserved for future host token hashing. |
| **Error code migration** | API contracts | Several error codes were renamed to match SDD §23.4: `VALIDATION_ERROR` → `VALIDATION_FAILED`, `UNAUTHENTICATED` → `AUTH_REQUIRED`, `NICKNAME_UNAVAILABLE` → `NICKNAME_TAKEN`, `EVENT_FAILED` → `INTERNAL_ERROR`, `INVALID_TOKEN`/`TOKEN_EXPIRED` → `WEBSOCKET_TOKEN_INVALID`. Consumers expecting old codes must update. |
| **`pnpm audit` not in CI** | CI/CD | SDD §39.4 specifies `pnpm audit` with critical/high failures blocking CI. Not yet implemented. |
| **`packages/config` has no scripts** | Tooling | Pure config package — intentional, but may surprise agents trying `pnpm --filter @trackstacc/config lint`. |
| **Root-level files not linted** | Code quality | `prisma/seed.ts`, `scripts/`, and root config files are not covered by any `lint` script. |
| **Prisma wrapper masks missing env** | Developer experience | `prisma.mjs` fallback `DATABASE_URL` makes `validate`/`generate` work without `.env`, but may mask a missing DB setup. |
| **`pnpm dev` is persistent** | Developer workflow | Runs both API and web dev servers via Turbo. Use `Ctrl+C` to stop — not a finite verification command. |
| **`pnpm db:migrate` is interactive** | Developer workflow | First run prompts for migration name. Use `pnpm --filter api prisma migrate dev --name <name>` for non-interactive. |
| **Root `package.json` name is `track-stacc`** | Cosmetic | Matches repo name (`0x0a1f-stacc/track-stacc`), product name is `trackstacc.live`. |

---

## Verification Notes

All commands verified on 2026-06-08 against commit at `apps/api/src/main.ts:81`, `turbo: 2.9.16`, `prisma: 6.19.3`.

- `pnpm lint`: 5 packages, all clean
- `pnpm typecheck`: 4 packages with TS, all clean (`packages/config` skipped)
- `pnpm test`: 40+ tests across 17 files in `apps/api`, all pass; `web`/`types`/`ui` have no test files
- `pnpm build`: 4 packages, Next.js output includes 6 static + 2 dynamic routes
- `pnpm --filter api prisma validate`: schema valid (warns about deprecated `package.json#prisma` property — non-blocking)
- `pnpm --filter api prisma generate`: Prisma Client generated to `node_modules/.pnpm/`
- `docker compose -f infra/docker-compose.yml config`: valid, Postgres 16 on `:5432`, Redis 7 on `:6379`
- `docker compose -f infra/docker-compose.prod.yml config`: valid, warns about unset env vars (expected without `.env`)
- `pnpm install`: no lockfile modifications on reinstall
