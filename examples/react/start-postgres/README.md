# TanStack Start + PostgreSQL

A shared notebook using Prisma 7 and PostgreSQL. It demonstrates migrations, server-only database access, loader reads, server validation, and a transaction that rolls back a category when its note cannot be created.

This example has no user accounts. Anyone with access can create notes. Add endpoint authorization and your application's abuse controls before making it public.

## Run locally

With Docker Compose v2 available, install repository dependencies and build the framework packages as described in [Contributing](https://github.com/TanStack/router/blob/main/CONTRIBUTING.md), then run from this directory:

```sh
cp .env.example .env
docker compose up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open http://localhost:3120. The Compose service listens only on localhost:5433 and stores its database in a named volume. If that port is in use, change the port mapping and `.env` together. You can instead use an existing local PostgreSQL server with a dedicated database and update `DATABASE_URL`.

`db:migrate` applies the committed migrations to an empty database. After changing `prisma/schema.prisma`, run `pnpm db:dev --name your_change` to generate and apply a development migration, then `pnpm db:generate`. Commit the schema and migration SQL, not generated client files or `.env`.

Stop the local database with `docker compose down`. Its named volume remains available for the next run.

### Native PostgreSQL alternative

If PostgreSQL tools are installed locally, initialize a separate development cluster instead of starting Compose. These commands use the same `.env.example` connection settings and must run only once for a new cluster:

```sh
printf '%s\n' 'start_demo' > .postgres-password
initdb -D .postgres -U start_demo --auth-local=trust --auth-host=scram-sha-256 --pwfile=.postgres-password
pg_ctl -D .postgres -l .postgres/server.log -o '-p 5433 -h 127.0.0.1' start
PGPASSWORD=start_demo createdb -h 127.0.0.1 -p 5433 -U start_demo start_demo
```

Then run the same generation, migration, and application commands above. Stop this cluster with `pg_ctl -D .postgres stop`. Use separate credentials and a managed lifecycle for production; these are local demo settings.

## What happens on a write

1. The POST server function validates the slug, title and category.
2. A Prisma transaction upserts the category and inserts the note.
3. A duplicate slug rolls back the whole transaction, including a newly created category. The interface receives a specific duplicate-slug message.
4. After success, Router invalidation reloads the list from PostgreSQL.

`src/start.ts` enables Start's CSRF middleware for server-function requests. Browser calls from the same origin work; cross-site calls are rejected. This does not replace endpoint authorization.

The server-only module owns the Prisma client and a bounded connection pool. The loader calls a server function instead of importing the database into browser code. The response only includes the selected note fields. Unexpected database failures use a generic UI error rather than exposing database details.

## Verify

Use a dedicated test database. Tests create unique records and remove only those records afterward.

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
POSTGRES_EXAMPLE_PRODUCTION=1 pnpm test:e2e
```

Each test run starts a disposable PostgreSQL 17 server on localhost:3121, generates the client, applies migrations, and stops and removes the database afterward, including when tests fail. The runner supplies its own database URL, so tests do not need a `.env` file or a running Compose service. Keep application port 3120 and database port 3121 free. The pinned `embedded-postgres` development dependency provides the database binaries; its platform package install script restores required native-library links.

The tests check persisted SSR data, reloads, server validation and database rollback. For a manual production start, export `DATABASE_URL` in the server environment and run `PORT=3120 pnpm start`. Do not assume a production Node process will load `.env`; the Prisma CLI, Vite development server, and Playwright configuration load it for their own processes.

## Deploy

Use a Node-compatible host for this `pg` adapter and Nitro build. Generate the Prisma client during the build. Client generation and the build do not need a database URL; migrations and the running server do. Apply `prisma migrate deploy` once as a release step before starting compatible application instances, rather than running migrations in each request. Use a separate migration connection if your provider's pooler requires it.

Set `DATABASE_URL` as a server secret. Never prefix it with `VITE_`, serialize it to a loader response, or commit it. Configure TLS using your provider's certificate guidance. Size the pool for the total number of processes and database connection limit. Edge runtimes may need a different supported adapter.

Back up production data and plan compatibility between old and new application versions before schema changes. Rolling back application code does not undo a database migration.
