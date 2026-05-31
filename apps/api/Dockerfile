FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY prisma/schema.prisma prisma/schema.prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
CMD ["sh", "-c", "pnpm --filter api prisma migrate deploy && node apps/api/dist/main.js"]
