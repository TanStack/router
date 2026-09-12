---
id: learn-start-data
title: Learn Start, Read Notes from PostgreSQL
description: Move the Field notes app from static data to PostgreSQL with Prisma migrations, server-only queries, loader dependencies, and repeatable checks.
---

Keep the URLs from the routing chapter and move the data into PostgreSQL. The [working checkpoint](https://github.com/TanStack/router/tree/main/examples/react/start-learn/checkpoints/03-data) is `checkpoints/03-data`.

## Prepare a dedicated database

Install PostgreSQL and make its `initdb`, `pg_ctl`, and `createdb` commands available. From `examples/react/start-learn`, create a local development cluster and database:

```sh
cp .env.example .env
printf '%s\n' 'start_demo' > .postgres-password
initdb -D .postgres -U start_demo --auth-local=trust --auth-host=scram-sha-256 --pwfile=.postgres-password
pg_ctl -D .postgres -l .postgres/server.log -o '-p 5433 -h 127.0.0.1' start
PGPASSWORD=start_demo createdb -h 127.0.0.1 -p 5433 -U start_demo learn_start
```

Run initialization once for a new cluster, not every time you open the project. The database listens on localhost:5433. If that port is occupied, choose another port and update `.env` too. If you already run PostgreSQL, create a separate `learn_start` database there and set its connection URL instead.

These are local demo credentials. `.env`, `.postgres`, and the password file are ignored by Git. Stop this cluster with `pg_ctl -D .postgres stop` when you finish, and restart it with the same `pg_ctl ... start` command. Do not use a production database for course exercises.

## Apply the schema and sample data

```sh
pnpm db:generate:03
pnpm db:migrate:03
pnpm db:seed:03
```

Generation produces this checkpoint's Prisma client. Migration applies the committed SQL. The seed inserts the two notes from the previous chapter and their category; rerunning it leaves existing records alone.

Inspect `prisma/schema.prisma` in the checkpoint. `Note` has a unique `slug`, a `title`, a `body`, and a relation to `Category`. The relation keeps category references valid at the database boundary. The next chapter uses it to demonstrate transaction rollback.

The Prisma configuration loads `DATABASE_URL` from the course environment and points to this checkpoint's schema and migrations. Keep schema changes and migration SQL together. Generating the client updates TypeScript code; it does not apply changes to the database.

## Make the database module server-only

`src/server/db.server.ts` imports the server-only marker and creates a Prisma client with the PostgreSQL adapter. It fails clearly if `DATABASE_URL` is missing. The pool is shared by requests within that module instance, while query results are returned per request.

Import that module only from server implementations. The browser needs the selected note fields, not a database client or connection URL. The complete configuration follows the [PostgreSQL recipe](../../guide/databases).

## Call server functions from loaders

A route loader can run during browser navigation, so it must not connect to PostgreSQL directly. `listNotes` and `getNote` are server functions in `src/server/notes.ts`. They validate input and select only the fields the page uses.

The index route now makes its dependency on search explicit:

<!-- tested-source: data-loader -->

```tsx
validateSearch: z.object({ q: z.string().max(200).catch('') }),
loaderDeps: ({ search }) => ({ q: search.q }),
loader: ({ deps }) => listNotes({ data: deps }),
```

Import `z` from `zod` and `listNotes` from `../server/notes`. The component reads `Route.useLoaderData()` instead of filtering a module-level array. PostgreSQL filters titles case-insensitively. An invalid search value falls back to the empty filter.

The detail loader awaits `getNote({ data: params.slug })`. If no note exists, it throws `notFound()` just as the static version did. The page component still reads the loader result, so the database change does not require a new component data-fetching pattern.

Both routes use `Cache-Control: no-store` in this checkpoint. `src/start.ts` enables Start's CSRF middleware for requests to server functions. These protections do not authenticate a user; this chapter only reads public sample content.

## Verify the data path

```sh
pnpm exec vite checkpoints/03-data --port 3142
```

Open http://localhost:3142 and follow a note link. Reload the detail page. You should see the same content that the earlier chapter served from a file.

Stop the development server, then run:

```sh
COURSE_CHECKPOINT=03-data pnpm test:e2e
```

The runner prepares an isolated test database automatically. The test writes a uniquely named record directly to that database, checks that its title appears in raw server HTML, opens its detail page, reloads it, and checks an unknown note's 404 response. It deletes only its own test records. That distinguishes a working database loader from an app that still displays its old static array.

If the database is unavailable, the checkpoint displays a generic recovery page. Inspect the server terminal for connection details. Do not display credentials or raw database errors to a reader.

Next: [Create notes with a validated form](./forms).
