# Synergilon

Market intelligence for Shopify stores and paid-social creatives (a Trendtrack.io-style SaaS). Turborepo monorepo:

| Workspace             | What it is                                                             |
| --------------------- | ---------------------------------------------------------------------- |
| `apps/web`            | Next.js (App Router) UI + Route Handlers, Auth.js, Tailwind, shadcn/ui |
| `packages/db`         | Prisma schema, migrations, seed, shared Prisma client                  |
| `packages/worker`     | pg-boss job runner: daily snapshot drift + cache invalidation          |
| `packages/mcp-server` | Stdio MCP server exposing search/trending/insights tools               |

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

> **Database name.** The product was renamed from MarketPulse to Synergilon; the Postgres database in `docker-compose.yml` and `.env.example` is still called `marketpulse` so existing local databases keep working. Rename it in both places if you want a clean slate.

`/` redirects to `/dashboard`. With no auth provider configured, `/login` shows a "no auth providers configured" state and the browsing pages work anonymously. Folders and saved items need a signed-in user: either configure a provider, or keep `AUTH_DEV_LOGIN=true` (the `.env.example` default) and use the **Dev login** button on `/login`, which creates a local user with a real database session. The dev login is disabled in production builds.

## Scripts (repo root)

| Command                  | Description                                |
| ------------------------ | ------------------------------------------ |
| `pnpm dev`               | All workspaces in dev mode (via Turbo)     |
| `pnpm web:dev`           | Only the Next.js app                       |
| `pnpm build`             | Build everything                           |
| `pnpm lint`              | ESLint across workspaces                   |
| `pnpm typecheck`         | `tsc --noEmit` across workspaces           |
| `pnpm format`            | Prettier write (`format:check` to verify)  |
| `pnpm db:up` / `db:down` | Start / stop Postgres via Docker Compose   |
| `pnpm db:migrate`        | Create/apply migrations in development     |
| `pnpm db:deploy`         | Apply pending migrations (production)      |
| `pnpm db:reset`          | Drop, re-migrate and re-seed               |
| `pnpm db:seed`           | Seed mock data (`SEED_SCALE=small\|large`) |
| `pnpm db:studio`         | Prisma Studio                              |
| `pnpm worker:dev`        | Run the worker daemon (pg-boss schedule)   |
| `pnpm worker:run-once`   | Run the snapshot job once and exit         |
| `pnpm mcp:dev`           | Run the MCP server over stdio              |

## Environment variables

One `.env` at the repo root is shared by every workspace (`apps/web` loads it from `next.config.ts`, the Node packages via `@synergilon/db/load-env`). See [`.env.example`](.env.example) for the full documented list.

| Variable                                      | Required | Purpose                                                               |
| --------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                                | yes      | Postgres connection string                                            |
| `SEED_SCALE`                                  | no       | `small` (default) or `large`                                          |
| `AUTH_SECRET`                                 | prod     | Auth.js secret (`openssl rand -base64 32`)                            |
| `AUTH_URL`, `AUTH_TRUST_HOST`                 | no       | Needed behind a proxy / non-localhost host                            |
| `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET`       | no       | Enables GitHub OAuth                                                  |
| `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`       | no       | Enables Google OAuth                                                  |
| `AUTH_RESEND_KEY` + `AUTH_EMAIL_FROM`         | no       | Enables email magic links via Resend                                  |
| `AUTH_DEV_LOGIN`                              | no       | `true` enables the local "Dev login" button (never in production)     |
| `REDIS_URL`                                   | no       | Upstash/Redis for caching + rate limiting; no-ops when unset          |
| `SNAPSHOT_CRON`, `SNAPSHOT_MAX_DRIFT_PCT`     | no       | Worker schedule (UTC cron, default `0 3 * * *`) and max drift (±5%)   |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS` | no       | Public API limit per IP (default 60 / 60s); needs Redis               |
| `DATA_SOURCE`                                 | no       | `mock` (default) or `shopify` — selects the repository implementation |
| `MCP_USER_ID`                                 | no       | Default user for MCP `save_to_folder`                                 |
| `AI_PROVIDER`, `AI_MODEL`                     | no       | Chat vendor (`anthropic` default, or `openai`) and model override     |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`        | no       | Enables `/chat`; without a key the page shows a disabled state        |

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

## UI

- **Discover** (`/discover`): trending store cards (logo, revenue, traffic, tech stack, 7-day growth) with infinite scroll on cursor pagination. `?q=` switches to full-text search ranked by relevance; `?category=` filters. Filters live in the URL so views are shareable.
- **Ad Library** (`/ads`): filterable table (search, platform, minimum engagement, sort) with "Load more" pagination. Clicking a row opens a detail modal with the creative, copy, metrics and target audience. `?storeId=` scopes it to one store.
- **Store detail** (`/store/[domain]`): stats, a Recharts revenue-over-time line built from `StoreSnapshot`, top product, tech stack, and the store's most recent ads. The "Save to folder" button is wired in Phase 4.

- **Folders & saved items**: a Notion-style tree in the sidebar (expand/collapse, inline rename via double-click or the row menu, nested create, delete) that doubles as a drop target. "Save to folder" on a store page or in the ad modal opens a picker with inline folder creation and notes. `/saved` lists everything, or one folder with breadcrumbs and subfolders; cards can be dragged onto sidebar folders (`@dnd-kit`), moved via a dropdown, annotated, or removed.

Pages render the first page on the server through the repositories and hand it to a client component, which fetches subsequent pages from the JSON API. Every list has a loading skeleton and an empty state.

Folder and saved-item logic lives in `packages/db/src/services/` (not the repository layer, since these are the app's own tables rather than an external data source) so the API routes, server pages and the MCP `save_to_folder` tool share one implementation, including `ensureFolderPath("Competitors/Skincare")`.

## API

All routes validate query params with Zod and return errors as `{ error: { code, message, details? } }` with the right status (400 `VALIDATION_ERROR` / `INVALID_CURSOR`, 404 `NOT_FOUND`, 500 `INTERNAL_ERROR`).

| Route                      | Params                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/stores`          | `q`, `category`, `minRevenue`, `maxRevenue`, `minTraffic`, `maxTraffic`, `sort=revenue\|traffic\|newest\|name\|relevance`, `order`, `limit` (≤100), `cursor`                                    |
| `GET /api/stores/trending` | `category`, `limit`, `cursor` — ranked by revenue growth over the last 7 snapshots, then absolute revenue                                                                                       |
| `GET /api/stores/:domain`  | Store detail with all snapshots, 20 most recent ads and `adCount`                                                                                                                               |
| `GET /api/ads`             | `q`, `platform=META\|TIKTOK\|GOOGLE`, `storeId`, `minEngagement`, `maxEngagement`, `minSpend`, `maxSpend`, `sort=engagement\|spend\|impressions\|newest\|relevance`, `order`, `limit`, `cursor` |
| `GET /api/ads/:id`         | Single ad with its store reference                                                                                                                                                              |
| `GET /api/folders/tree`    | Signed-in user's nested folders with per-folder saved counts                                                                                                                                    |
| `POST /api/folders`        | `{ name, parentId? }` → 201. 409 on duplicate name within the same parent                                                                                                                       |
| `PATCH /api/folders/:id`   | `{ name?, parentId? }` (rename / move; `parentId: null` = root). Rejects cycles                                                                                                                 |
| `DELETE /api/folders/:id`  | Deletes subfolders and their saved items → 204                                                                                                                                                  |
| `GET /api/saved`           | `?folderId=` → items with store/ad resolved; `?itemType=&itemId=` → folders containing that item                                                                                                |
| `POST /api/saved`          | `{ itemType, itemId, folderId, notes? }` → 201. 409 if already in that folder                                                                                                                   |
| `PATCH /api/saved/:id`     | `{ folderId?, notes? }` (move / annotate)                                                                                                                                                       |
| `DELETE /api/saved/:id`    | → 204                                                                                                                                                                                           |

Folder and saved routes require a session and return 401 `UNAUTHORIZED` otherwise.

```bash
curl "http://localhost:3000/api/stores?q=group&sort=relevance&limit=5"
curl "http://localhost:3000/api/ads?platform=TIKTOK&minEngagement=5&sort=spend"
```

## Worker

`packages/worker` runs on **pg-boss** (queue tables live in the same Postgres under the `pgboss` schema, no extra infra).

- `pnpm worker:dev` — daemon. Registers the `store-snapshot` queue, schedules it with `SNAPSHOT_CRON` (5-field cron, UTC, default `0 3 * * *`), and works it. Re-registering on restart replaces the schedule, so restarts are idempotent.
- `pnpm worker:run-once` — runs the job immediately and exits (manual trigger).

The job drifts every store's `monthlyRevenue` / `monthlyTraffic` by an independent random factor within `±SNAPSHOT_MAX_DRIFT_PCT` (default 5%, traffic slightly less correlated), stamps `lastScrapedAt`, and writes one new `StoreSnapshot` per store — all in a single SQL statement (`UPDATE … RETURNING` feeding an `INSERT` via CTE), so 10k stores is one round trip. Afterwards it calls `cache.invalidate("stores", "ads")`, which bumps the Redis namespace versions so the next read repopulates.

## Rate limiting

When `REDIS_URL` is set, public API routes (`/api/stores*`, `/api/ads*`) get a fixed-window limit per client IP (`RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_SECONDS`, default 60/min) via `INCR` + `EXPIRE`. Responses carry `X-RateLimit-Limit` / `X-RateLimit-Remaining`; over the limit returns `429 RATE_LIMITED` with `Retry-After`. Without Redis (or if Redis errors) requests pass through. Session-gated routes (folders, saved, chat) are not rate limited by IP since they are already per-user.

## Docker images

```bash
docker build -f apps/web/Dockerfile -t synergilon-web .
docker run --rm -p 3000:3000 --env-file .env -e AUTH_TRUST_HOST=true synergilon-web

docker build -f packages/worker/Dockerfile -t synergilon-worker .
docker run --rm --env-file .env synergilon-worker           # daemon
docker run --rm --env-file .env synergilon-worker --once    # single run
# or, against the compose Postgres:
docker compose --profile worker up -d
```

Deployment itself is out of scope.

## MCP server & chat

Both use the **same tool implementations** in `packages/db/src/tools/index.ts` (Zod schema + `execute` over the repositories/services). The MCP server adapts them with `registerTool`; the chat route adapts them with the AI SDK's `tool()`. Add a tool once and both hosts pick it up.

| Tool                  | Input                                                   | Notes                                                               |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `search_ads`          | `query`, `platform?`, `minEngagement?`, `limit?`        | Full-text search, relevance-ranked                                  |
| `get_trending_stores` | `limit?`, `category?`                                   | Ranked by 7-snapshot revenue growth, fallback to absolute revenue   |
| `get_store_insights`  | `domain`                                                | Metrics, 30-day history, tech stack, top product, recent ads        |
| `save_to_folder`      | `itemType`, `itemId`, `folderPath`, `userId?`, `notes?` | Creates missing folders in the path. MCP: `userId` or `MCP_USER_ID` |

### Claude Desktop

`pnpm mcp:dev` runs the server over stdio. Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "synergilon": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/synergilon", "mcp:dev"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/marketpulse",
        "MCP_USER_ID": "<your User.id>"
      }
    }
  }
}
```

The server also reads the repo-root `.env`, so the `env` block is optional when that file is filled in. `MCP_USER_ID` is the `User.id` that `save_to_folder` writes to; find it in Prisma Studio (`pnpm db:studio`).

Smoke test without a client:

```bash
pnpm mcp:dev <<'JSON'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_trending_stores","arguments":{"limit":3}}}
JSON
```

### `/chat`

Vercel AI SDK (`streamText` + `useChat`) with the same tools, up to 6 tool steps per turn. The provider comes from `AI_PROVIDER` (`anthropic` by default, model `claude-opus-5`; or `openai`) and `AI_MODEL`; with no API key the page renders a disabled state. `save_to_folder` uses the signed-in user, so saving from chat requires a session.

## Roadmap

1. **Foundation & Auth** — monorepo, DB, seed, auth, app shell, dashboard ✅
2. **Repositories & API** — repository pattern, FTS, cursor-paginated `/api/stores` + `/api/ads`, Redis cache ✅
3. **Discovery UI** — `/discover`, `/ads`, `/store/[domain]` ✅
4. **Folders & saved items** — nested folders, sidebar tree, drag-and-drop, `/saved` ✅
5. **MCP server & `/chat`** — shared tools, stdio MCP server, AI SDK chat ✅
6. **Worker, cache invalidation, rate limiting** — pg-boss daily snapshot drift, Redis-backed API limits ✅
