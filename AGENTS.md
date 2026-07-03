# TitanBot / ScreenMaple — Agent Guide

## Quick start
- `npm start` — runs `src/app.js`
- `npm test` — Node built-in test runner (`node --test tests/**/*.test.js`)
- `npm run migrate` — apply PostgreSQL migrations
- `npm run migrate:check` — verify schema version
- `npm run migrate:status` — show current migration status
- CI runs on pushes to `main`/`master`/`mitchwork` and PRs (Node 20, `npm ci`, `npm test`)

## Architecture
- **ESM** (`"type": "module"`) — use `import`/`export`, no `require`
- Entry: `index.js` → `src/app.js` (`TitanBot` class extends `discord.js.Client`)
- App flow: initialize MongoDB → start web server → load commands → load handlers → login → register slash commands → setup cron jobs
- Commands live in `src/commands/<Category>/` as slash commands; handlers in `src/handlers/` route buttons/modals/selects
- Centralized config: `src/config/bot.js` is the **single source of truth** for embed colors, economy, tickets, etc.
- Color helper: `getColor("success")` or `getColor("ticket.open")` — returns parsed integer

## Database
- **MongoDB** is the primary database (uses `MONGODB_URI` env var, collection `kv_store` and `screenmapledb` db)
- PostgreSQL config exists (`src/config/postgres.js`) but code currently runs on MongoDB — the `src/utils/database.js` facade targets MongoDB
- In-memory fallback if DB is unreachable at startup (degraded mode, logs a warning)
- Schema migrations (`scripts/migrate.js`) are PostgreSQL-specific — only relevant if PG is configured
- When modifying schema, update `SCHEMA_VERSION` and `SCHEMA_VERSION_LABEL` in `.env.example`

## Web server (Express)
- Port 3000 with auto-retry (`PORT_RETRY_ATTEMPTS=5`)
- Health: `GET /health`, `GET /ready`, `GET /`
- CORS wildcard by default (`CORS_ORIGIN=*`)

## Env quirks
- `NODE_ENV=production` enables stricter startup validation (requires PG credentials)
- `MULTI_GUILD=true` registers slash commands globally (slow propagation); leave unset/false for single-guild
- `LOG_LEVEL` aliases: `warns`/`warning`/`warnings` → `warn`
- `OWNER_IDS` — comma-separated Discord user IDs for bot owner commands
- `DISCORD_TOKEN` or `TOKEN` accepted for the bot token

## Testing
- Node built-in test runner with `node:test` and `node:assert/strict`
- Tests in `tests/*.test.js`; also `tests/failure-paths/`
- No linter/formatter config — match surrounding code style
- Tests import directly from `src/`, not built output

## Code conventions
- ES modules everywhere, async/await
- Guild-scoped data must stay isolated per server (critical for `MULTI_GUILD=true`)
- Prefix commands still supported via `process.env.PREFIX` (default `!`)
- Cron jobs defined in `src/app.js:setupCronJobs()` — birthday check at 06:00, giveaway check every minute, counters every 15 min
- Graceful shutdown on SIGTERM/SIGINT handles DB close, cron stop, Discord client destroy

## Docker
- `docker-compose up -d` starts bot + PostgreSQL
- Image published to `ghcr.io/codebymitch/titanbot:main` on push to main
- `Dockerfile` uses `npm ci --omit=dev` (prod deps only)

## CI workflows
- `tests.yml` — `npm ci && npm test` on PR/push to main/master/mitchwork
- `docker-publish.yml` — build & push to GHCR on main branch pushes and version tags
- `migration-version-check.yml` — validates PG migration version
- `restore-drill.yml` — backup restore drill test
