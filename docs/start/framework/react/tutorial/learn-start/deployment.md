---
id: learn-start-deployment
title: Learn Start, Build and Deploy the Node Server
description: Build a standalone TanStack Start Node server, apply database migrations, configure runtime secrets, and verify readiness and server-rendered pages.
---

Build the same notebook as a Node server. The [working checkpoint](https://github.com/TanStack/router/tree/main/examples/react/start-learn/checkpoints/07-deployment) is `checkpoints/07-deployment`. It adds an explicit Node output preset and a database readiness endpoint.

## Build and run locally

Keep the account database and secret from the previous chapter. From `examples/react/start-learn`, run:

```sh
pnpm db:generate:07
pnpm db:migrate:07
pnpm build:07
APP_ORIGIN=http://localhost:3146 PORT=3146 node --env-file=.env checkpoints/07-deployment/.output/server/index.mjs
```

If the account database is empty, run `pnpm db:seed:07` before starting. The build runs Vite and TypeScript. The explicit environment variables above override the values in `.env`, while `--env-file` supplies the database connection and auth secret for this local run.

Open http://localhost:3146 and sign in. Create a note, publish it, and open its public URL in another browser session. Restart the process and verify the note remains. PostgreSQL owns persistence; the build directory does not.

`/healthz` returns `200 ok` only after a PostgreSQL query succeeds. A failed query returns `503 unavailable` without database details. Use it as a readiness check. A database outage should remove an instance from traffic, not cause an endless process-restart loop.

## Deploy the complete output directory

The checkpoint selects Nitro's Node server preset. Its output is `checkpoints/07-deployment/.output`, including the server and public assets. Copy that whole directory to a Node host, then start it with:

```sh
node .output/server/index.mjs
```

If the host runs from the source checkout instead, `pnpm start:07` starts the same entry point. It expects runtime environment variables to already be set. Do not copy your local `.env` into a public directory or bake credentials into the artifact.

Nitro supports a standalone Node output and uses `PORT` for the listening port. Terminate HTTPS at the host's reverse proxy. See [Nitro's Node deployment reference](https://nitro.build/deploy/runtimes/node).

Use a Node version supported by the repository's current toolchain and pin it in the host configuration. Match the version used for your build and tests. The repository is a pnpm workspace, so use the installation and package-build steps from the [setup chapter](./setup) before running this checkpoint's build command in a fresh checkout.

## Configure the runtime and release job

| Setting              | Value                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------- |
| `AUTH_DATABASE_URL`  | The production PostgreSQL connection string, with the provider's required TLS settings. |
| `BETTER_AUTH_SECRET` | A stable, random secret of at least 32 characters, stored in the host's secret manager. |
| `APP_ORIGIN`         | The public HTTPS origin, without a trailing slash.                                      |
| `PORT`               | The port assigned by the Node host.                                                     |
| `NODE_ENV`           | `production`.                                                                           |

Keep the database in a reachable region and size its connection capacity for all instances. Each instance's pool allows up to five connections. Multiple replicas multiply that limit.

Run `pnpm db:migrate:07` once in the release job, using the source checkout, Prisma configuration, migration files, and production database credentials. The standalone output is the runtime artifact, not a migration runner. Apply migrations before routing traffic to code that needs them. Do not use the sample seed as a production release step.

Keep the previous artifact available for rollback. Roll back application code only when it remains compatible with the current database schema. Database migrations require their own recovery plan and tested backups.

## Verify the hosted application

After deploying, check the actual HTTPS origin:

1. `/healthz` returns 200, and a public note loads directly with its body and metadata in the HTML.
2. Its canonical URL and `/sitemap.txt` use the production origin, not localhost or a preview hostname.
3. Sign-in survives reload; creating, publishing, and unpublishing a note works.
4. Another account cannot read a draft or change its publication state, and signed-out writes fail.
5. Sign-out returns to the login page, and an unknown public note returns 404.

These hosted checks are separate from a local production build. The included tests do not provision hosting, configure DNS or TLS, or verify a remote deployment.

## Finish account operations before public registration

This checkpoint retains the course's email/password configuration. Email verification and password recovery are not wired to a mail service. Configure and test the flows your service requires before opening registration to real users, or keep the deployed course behind your host's access controls.

Review rate-limit storage and trusted client-IP handling for your host. Better Auth's default in-memory limits are per process; multiple instances need suitable shared storage and proxy configuration. See [Better Auth's rate-limit documentation](https://better-auth.com/docs/concepts/rate-limit). Check the APIs against the version installed in this example before changing its configuration.

## Run the deployment checks

Stop the local server, then run:

```sh
COURSE_CHECKPOINT=07-deployment pnpm test:e2e
COURSE_PRODUCTION=1 COURSE_CHECKPOINT=07-deployment pnpm test:e2e
```

The production run checks readiness and direct server HTML, scans public assets for the configured secrets, and runs a copied artifact outside the repository against an unavailable database. It expects a generic 503 response. Run `pnpm build:07` again after source changes before repeating production tests.

Next: [Test the complete application](./tests).
