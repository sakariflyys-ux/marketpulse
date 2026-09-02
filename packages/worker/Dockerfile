# packages/worker — pg-boss daemon. Build from the repo root:
#   docker build -f packages/worker/Dockerfile -t marketpulse-worker .
#   docker run --rm --env-file .env marketpulse-worker            # daemon
#   docker run --rm --env-file .env marketpulse-worker --once     # single run
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY packages/worker/package.json packages/worker/
RUN pnpm install --frozen-lockfile --filter @marketpulse/worker...

COPY packages/db packages/db
COPY packages/worker packages/worker
RUN pnpm --filter @marketpulse/db generate

ENV NODE_ENV=production
WORKDIR /app/packages/worker
ENTRYPOINT ["pnpm", "exec", "tsx", "src/index.ts"]
