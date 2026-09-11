---
id: databases
title: Databases
description: Build a TanStack Start app with PostgreSQL and Prisma, including migrations, server-only queries, validated mutations, transaction rollback, and deployment.
---

Databases are at the core of any dynamic application, providing the necessary infrastructure to store, retrieve, and manage data. TanStack Start makes it easy to integrate with a variety of databases, offering a flexible approach to managing your application's data layer.

## What should I use?

TanStack Start is **designed to work with any database provider**, so if you already have a preferred database system, you can integrate it with TanStack Start using the provided full-stack APIs. Whether you're working with SQL, NoSQL, or other types of databases, TanStack Start can handle your needs.

## Build a PostgreSQL app with Prisma

The [PostgreSQL example](../examples/start-postgres) is a runnable shared notebook using Prisma 7. It includes a schema, committed migrations, loader reads, validated server functions, transaction rollback, and browser tests. It has no user accounts, so anyone with access can write to it. Add [endpoint authorization](./authentication-server-primitives#protect-data-first) before using the pattern for private data.

### Create and migrate a local database

After installing the repository dependencies and building its framework packages as described in [Contributing](https://github.com/TanStack/router/blob/main/CONTRIBUTING.md), run:

```sh
cd examples/react/start-postgres
cp .env.example .env
docker compose up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm dev
```

With Docker Compose v2 installed, the example's Compose file starts PostgreSQL 17 on localhost:5433. Its `.env.example` contains local demo credentials. Keep your own `.env` out of Git, and change the port and connection URL together if the port is occupied. The example README also includes native PostgreSQL initialization commands. An existing local PostgreSQL server works with a dedicated database and a matching `DATABASE_URL`.

The schema relates each note to a category:

```prisma
model Category {
  name String @id
  notes Note[]
}

model Note {
  slug String @id
  title String
  categoryName String
  category Category @relation(fields: [categoryName], references: [name])
}
```

`pnpm db:migrate` runs `prisma migrate deploy` to apply committed SQL. For subsequent schema changes, run `pnpm db:dev --name your_change` against a development database, then regenerate the client with `pnpm db:generate`. Review and commit the generated migration SQL. Do not use development reset commands against production data.

### Keep the database on the server

The example's `src/server/db.server.ts` creates one Prisma client per server module instance, backed by the PostgreSQL driver adapter. It reads `DATABASE_URL` only on the server and declares a server-only import boundary:

```ts
import '@tanstack/react-start/server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('Set DATABASE_URL before starting the server')
}

export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 5 }),
})
```

A connection pool can be shared by requests. Account-specific query results must not be shared without appropriate isolation. Five connections is this example's setting, not a universal recommendation; budget connections across every application instance.

Route loaders can run in the browser after navigation. Call a server function from the loader, then perform the database query inside that function. The example selects only `slug`, `title`, and `categoryName`, so it does not serialize the client or connection configuration. See [Import Protection](./import-protection) and [Server Functions](./server-functions).

### Validate and write atomically

The POST server function validates the slug format and bounds the title and category lengths before entering a transaction. Browser input attributes are only interface feedback; the server validates again. The example also enables Start's CSRF middleware in `src/start.ts` for server-function requests and tests that a cross-site call is rejected. CSRF protection does not replace endpoint authorization.

Inside the transaction, it upserts a category and creates a note. If the unique note slug already exists, PostgreSQL rejects the insert and Prisma rolls back both operations. A newly created category does not remain behind. The handler catches Prisma's `P2002` unique-constraint error and returns a specific message. Unexpected errors reach the generic error interface instead of exposing database details.

After a successful write, the component awaits `router.invalidate()` to reload its Router-owned data. It keeps the form pending through the write and reload, and disables its JavaScript-dependent form until hydration. If Query owns your data instead, invalidate the relevant Query keys.

See the example's [server functions](https://github.com/TanStack/router/blob/main/examples/react/start-postgres/src/server/notes.ts) and [form route](https://github.com/TanStack/router/blob/main/examples/react/start-postgres/src/routes/index.tsx) for the complete implementation. Keep transactions short; do not hold one open while waiting for external APIs.

### Test the production build

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
POSTGRES_EXAMPLE_PRODUCTION=1 pnpm test:e2e
```

The tests use a dedicated database, create unique records, and clean up only those records. They verify initial HTML contains persisted notes, data survives reload, whitespace-only titles fail server validation, and duplicate-note failure rolls back its new category.

Also build with a harmless test credential and search client assets and any published source maps for it. Inspect response bodies too. A successful connection does not prove the credentials stayed on the server.

### Deploy with an explicit migration step

This example targets a Node-compatible host using Nitro and Prisma's `pg` adapter. Set `DATABASE_URL` in the production server environment; do not assume `.env` is loaded by the Node entry point. Generate the Prisma client at build time. Apply committed migrations once as a release step, not during requests or independently on every instance startup.

For a hosted database, follow its TLS and pooling instructions. A transaction pooler may require a separate direct migration connection. Other runtimes may require a different adapter. Retain backups and plan schema compatibility before deploying changes, because rolling back application code does not roll back the database. See [Hosting](./hosting), [Environment Variables](./environment-variables), and [Prisma's PostgreSQL connector](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).

## Recommended Database Providers

While TanStack Start is designed to work with any database provider, we highly recommend considering one of our vetted partner database providers [Neon](https://neon.tech?utm_source=tanstack) or [Convex](https://convex.dev?utm_source=tanstack). They have been vetted by TanStack to match our quality, openness, and performance standards and are both excellent choices for your database needs.

## What is Neon?

<a href="https://neon.tech?utm_source=tanstack" alt="Neon Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/neon-dark.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/neon-light.svg" width="280">
    <img alt="Neon logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/neon-light.svg" width="280">
  </picture>
</a>

Neon is a fully managed serverless PostgreSQL with a generous free tier. It separates storage and compute to offer autoscaling, branching, and bottomless storage. With Neon, you get all the power and reliability of PostgreSQL combined with modern cloud capabilities, making it perfect for TanStack Start applications.

Key features that make Neon stand out:

- Serverless PostgreSQL that scales automatically
- Database branching for development and testing
- Built-in connection pooling
- Point-in-time restore
- Web-based SQL editor
- Bottomless storage
  <br />
  <br />
- To learn more about Neon, visit the [Neon website](https://neon.tech?utm_source=tanstack)
- To sign up, visit the [Neon dashboard](https://console.neon.tech/signup?utm_source=tanstack)

## What is Convex?

<a href="https://convex.dev?utm_source=tanstack" alt="Convex Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/convex-white.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/convex-color.svg" width="280">
    <img alt="Convex logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/convex-color.svg" width="280">
  </picture>
</a>

Convex is a powerful, serverless database platform that simplifies the process of managing your application's data. With Convex, you can build full-stack applications without the need to manually manage database servers or write complex queries. Convex provides a real-time, scalable, and transactional data backend that seamlessly integrates with TanStack Start, making it an excellent choice for modern web applications.

Convex's declarative data model and automatic conflict resolution ensure that your application remains consistent and responsive, even at scale. It's designed to be developer-friendly, with a focus on simplicity and productivity.

- To learn more about Convex, visit the [Convex website](https://convex.dev?utm_source=tanstack)
- To sign up, visit the [Convex dashboard](https://dashboard.convex.dev/signup?utm_source=tanstack)

## What is Prisma Postgres?

<a href="https://www.prisma.io?utm_source=tanstack&via=tanstack" alt="Prisma Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/prisma-dark.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/prisma-light.svg" width="280">
    <img alt="Prisma logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/prisma-light.svg" width="280">
  </picture>
</a>

Instant Postgres, Zero Setup: Get a production-ready Postgres database in seconds, then dive straight back into code. We handle connections, scaling, and turning knobs so your flow never breaks. Blends perfectly with TanStack Start.

- Edge-optimized: Local region routing means lower latency and fewer hops. Even complex queries are one fast round trip.
- Fits your stack: Works with your frameworks, libraries, and tools for a smooth DX.
- Web UI: A hosted interface to inspect, manage, and query data with your team.
- Auto-scaling: Grows from zero to millions of users without cold starts or manual tuning.
- Unikernel isolation: Each DB runs as its own unikernel for security, speed, and efficiency.
  <br />
  <br />
- To learn more about Prisma Postgres, visit the [Prisma website](https://www.prisma.io?utm_source=tanstack&via=tanstack)
- To sign up, visit the [Prisma Console](https://console.prisma.io/sign-up?utm_source=tanstack&via=tanstack)

## Documentation & APIs

Use the runnable PostgreSQL example above for the complete setup-to-mutation workflow. The same server boundary applies to other providers: keep credentials and privileged queries in server functions or server routes, validate inputs, and authorize private operations at their endpoint.
