# apps/web — Next.js standalone image. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t synergilon-web .
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter @synergilon/web... 

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY apps/web apps/web
RUN pnpm --filter @synergilon/db generate \
 && pnpm --filter @synergilon/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
