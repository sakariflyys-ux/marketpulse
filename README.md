# MarketPulse

Market intelligence for Shopify stores and paid-social creatives (a Trendtrack.io-style SaaS). Turborepo monorepo:

| Workspace             | What it is                                                             |
| --------------------- | ---------------------------------------------------------------------- |
| `apps/web`            | Next.js (App Router) UI + Route Handlers, Auth.js, Tailwind, shadcn/ui |
| `packages/db`         | Prisma schema, migrations, seed, shared Prisma client                  |
| `packages/worker`     | pg-boss job runner (snapshot drift) — Phase 6                          |
| `packages/mcp-server` | Stdio MCP server exposing search/trending/insights tools — Phase 5     |

## Prerequisites

- Node.js ≥ 22.12 and pnpm 10 (`corepack enable`)
- Docker (for Postgres), or any Postgres 16 instance

## Setup

```bash
pnpm install
cp .env.example .env            # defaults match docker-compose.yml
pnpm db:up                      # docker compose up -d db
pnpm db:migrate                 # prisma migrate dev (also generates the client)
pnpm db:seed                    # SEED_SCALE=small -> 100 stores / 500 ads
pnpm web:dev                    # http://localhost:3000
```

`/` redirects to `/dashboard`. With no auth provider configured, `/login` shows a "no auth providers configured" state and the app is usable anonymously.

## Scripts (repo root)

| Command                  | Description                                  |
| ------------------------ | -------------------------------------------- |
| `pnpm dev`               | All workspaces in dev mode (via Turbo)       |
| `pnpm web:dev`           | Only the Next.js app                         |
| `pnpm build`             | Build everything                             |
| `pnpm lint`              | ESLint across workspaces                     |
| `pnpm typecheck`         | `tsc --noEmit` across workspaces             |
| `pnpm format`            | Prettier write (`format:check` to verify)    |
| `pnpm db:up` / `db:down` | Start / stop Postgres via Docker Compose     |
| `pnpm db:migrate`        | Create/apply migrations in development       |
| `pnpm db:deploy`         | Apply pending migrations (production)        |
| `pnpm db:reset`          | Drop, re-migrate and re-seed                 |
| `pnpm db:seed`           | Seed mock data (`SEED_SCALE=small\|large`)   |
| `pnpm db:studio`         | Prisma Studio                                |
| `pnpm worker:dev`        | Run the worker daemon (Phase 6)              |
| `pnpm worker:run-once`   | Run the snapshot job once and exit (Phase 6) |
| `pnpm mcp:dev`           | Run the MCP server over stdio (Phase 5)      |

## Environment variables

One `.env` at the repo root is shared by every workspace (`apps/web` loads it from `next.config.ts`, the Node packages via `@marketpulse/db/load-env`). See [`.env.example`](.env.example) for the full documented list.

| Variable                                | Required | Purpose                                                               |
| --------------------------------------- | -------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                          | yes      | Postgres connection string                                            |
| `SEED_SCALE`                            | no       | `small` (default) or `large`                                          |
| `AUTH_SECRET`                           | prod     | Auth.js secret (`openssl rand -base64 32`)                            |
| `AUTH_URL`, `AUTH_TRUST_HOST`           | no       | Needed behind a proxy / non-localhost host                            |
| `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` | no       | Enables GitHub OAuth                                                  |
| `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` | no       | Enables Google OAuth                                                  |
| `AUTH_RESEND_KEY` + `AUTH_EMAIL_FROM`   | no       | Enables email magic links via Resend                                  |
| `REDIS_URL`                             | no       | Upstash/Redis for caching + rate limiting; no-ops when unset          |
| `DATA_SOURCE`                           | no       | `mock` (default) or `shopify` — selects the repository implementation |
| `MCP_USER_ID`                           | no       | Default user for MCP `save_to_folder`                                 |

Each auth provider turns on only when its full pair of variables is set.

## Database

- Prisma 7 with the `pg` driver adapter. Schema: [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma).
- Full-text search: `Store.searchVector` (name + description) and `Ad.searchVector` (headline + bodyText) are `GENERATED ALWAYS AS ... STORED` `tsvector` columns with GIN indexes. Prisma cannot express generated columns, so they are declared as `Unsupported("tsvector")` in the schema (keeps `migrate diff` honest) and the expression lives in the hand-written migration `packages/db/prisma/migrations/*_fulltext_search`. Query with `websearch_to_tsquery('english', $q)`.
- Seeding is idempotent (truncates `Store` with cascade, then bulk-inserts with `createMany` in batches). Faker is seeded, so the dataset is deterministic. Every store gets 30 daily `StoreSnapshot` rows with a per-store trend plus noise so growth rankings are meaningful. `SEED_SCALE=large` (10k stores / 50k ads / 300k snapshots) takes under a minute locally.

## Running without Docker (Neon / Supabase)

Point `DATABASE_URL` at any Postgres 16+ instance and skip `pnpm db:up`:

```bash
# .env
DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
pnpm db:deploy        # apply migrations (no shadow DB needed)
pnpm db:seed          # SEED_SCALE=large for a realistic dataset
```

## Data access

### Repository pattern

`packages/db/src/repositories/` abstracts the **data source** (mock vs. real APIs), not the database:

- `StoreRepository` / `AdRepository` — interfaces (`list`, `trending`, `getByDomain`, `categories`, `getById`).
- `mock/Mock*Repository` — read the Faker-seeded Postgres tables. Raw SQL is used where Prisma can't express tsvector search, `ts_rank` ordering or window functions.
- `index.ts` — the single swap point. `getRepositories()` builds the implementations selected by `DATA_SOURCE` and wraps them in the cache. Adding `ShopifyStoreRepository` later is a one-line change here.

### Pagination and search

- Cursor pagination everywhere: `{ data, nextCursor }`. Cursors are opaque (base64url JSON). List endpoints use keyset cursors on `(sortValue, id)`; trending uses an offset cursor because its ranking is computed over a window.
- Full-text search via the generated `searchVector` columns and `websearch_to_tsquery`, so `q=organic skincare -oil` works. `sort=relevance` orders by `ts_rank` (falls back to revenue/engagement when `q` is empty).

### Cache

`packages/db/src/cache.ts` is a read-through Redis cache (5-minute TTL) wrapped around every repository method by `withCache`. With `REDIS_URL` unset, or Redis unreachable, it is a passthrough. Keys are namespaced and versioned (`mp:<ns>:v<n>:<method>:<args>`); `cache.invalidate("stores", "ads")` bumps the version instead of scanning keys, which is what the worker will call after writing snapshots.

## API

All routes validate query params with Zod and return errors as `{ error: { code, message, details? } }` with the right status (400 `VALIDATION_ERROR` / `INVALID_CURSOR`, 404 `NOT_FOUND`, 500 `INTERNAL_ERROR`).

| Route                      | Params                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/stores`          | `q`, `category`, `minRevenue`, `maxRevenue`, `minTraffic`, `maxTraffic`, `sort=revenue\|traffic\|newest\|name\|relevance`, `order`, `limit` (≤100), `cursor`                                    |
| `GET /api/stores/trending` | `category`, `limit`, `cursor` — ranked by revenue growth over the last 7 snapshots, then absolute revenue                                                                                       |
| `GET /api/stores/:domain`  | Store detail with all snapshots, 20 most recent ads and `adCount`                                                                                                                               |
| `GET /api/ads`             | `q`, `platform=META\|TIKTOK\|GOOGLE`, `storeId`, `minEngagement`, `maxEngagement`, `minSpend`, `maxSpend`, `sort=engagement\|spend\|impressions\|newest\|relevance`, `order`, `limit`, `cursor` |
| `GET /api/ads/:id`         | Single ad with its store reference                                                                                                                                                              |

```bash
curl "http://localhost:3000/api/stores?q=group&sort=relevance&limit=5"
curl "http://localhost:3000/api/ads?platform=TIKTOK&minEngagement=5&sort=spend"
```

## Docker image (web)

```bash
docker build -f apps/web/Dockerfile -t marketpulse-web .
docker run --rm -p 3000:3000 --env-file .env -e AUTH_TRUST_HOST=true marketpulse-web
```

Deployment itself is out of scope; the worker image lands with Phase 6.

## MCP server (Phase 5)

The Claude Desktop config snippet will be added here when the server ships:

```json
{
  "mcpServers": {
    "marketpulse": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/marketpulse", "mcp:dev"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/marketpulse",
        "MCP_USER_ID": "<user id>"
      }
    }
  }
}
```

## Roadmap

1. **Foundation & Auth** — monorepo, DB, seed, auth, app shell, dashboard ✅
2. **Repositories & API** — repository pattern, FTS, cursor-paginated `/api/stores` + `/api/ads`, Redis cache ✅
3. Discovery UI (`/discover`, `/ads`, `/store/[domain]`)
4. Folders & saved items
5. MCP server & `/chat`
6. Worker, cache invalidation, rate limiting
