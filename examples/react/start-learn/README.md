# Learn Start

Build Field notes through eight independently runnable checkpoints. The [course](https://tanstack.com/start/latest/docs/framework/react/tutorial/learn-start) explains each change, from a single route to an app with accounts and published notes.

This example lives in the TanStack Router workspace. Follow the repository's [contribution setup](../../../CONTRIBUTING.md) to install dependencies and build the framework packages first. Run the commands below from `examples/react/start-learn`.

## Start the course

```sh
pnpm dev
```

Open http://localhost:3140. This first checkpoint needs no database or auth secret.

| Checkpoint     | Source root                     | Port |
| -------------- | ------------------------------- | ---- |
| Setup          | `checkpoints/01-setup`          | 3140 |
| Routes         | `checkpoints/02-routes`         | 3141 |
| Data           | `checkpoints/03-data`           | 3142 |
| Forms          | `checkpoints/04-forms`          | 3143 |
| Authentication | `checkpoints/05-authentication` | 3144 |
| SEO            | `checkpoints/06-seo`            | 3145 |
| Deployment     | `checkpoints/07-deployment`     | 3146 |
| Tests          | `checkpoints/08-tests`          | 3147 |

Select another source root with Vite, for example `pnpm exec vite checkpoints/02-routes --port 3141`. Each source root has its own generated route tree and production output.

## Run the complete app

Create a PostgreSQL database for the account checkpoints. Copy `.env.example` to `.env`, set `AUTH_DATABASE_URL`, set `APP_ORIGIN` to `http://localhost:3147`, and generate `BETTER_AUTH_SECRET` with `openssl rand -base64 48`. Keep `.env` private.

```sh
pnpm db:generate:08
pnpm db:migrate:08
pnpm db:seed:08
pnpm exec vite checkpoints/08-tests --port 3147
```

Create an account from **My notes**. New notes are private until their owner publishes them. The seed adds two public sample notes.

Checkpoints 03 and 04 are anonymous local demos. They use `DATABASE_URL`, which must point to a separate database from `AUTH_DATABASE_URL`. Do not expose that anonymous app to a database containing private notes. Each database chapter documents its own generation, migration, and seed commands.

## Build and test

Stop the development server before running Playwright:

```sh
pnpm exec playwright install chromium
pnpm test:unit
pnpm test:e2e
```

`pnpm test:e2e` checks the documented source excerpts, then builds, typechecks, and tests all eight checkpoints in development and production. It starts an embedded PostgreSQL server on a free local port, creates a separate disposable database for each database checkpoint, generates Prisma clients, applies migrations and seeds, and supplies a generated auth secret. It does not use database credentials from your `.env`. Stop any course servers first because the browser checks use the ports listed above.

Select one checkpoint with `COURSE_CHECKPOINT=08-tests pnpm test:e2e`. Add `COURSE_PRODUCTION=0` for development only or `COURSE_PRODUCTION=1` for production only. Both modes run by default, and the runner builds the selected checkpoint before testing it. The database and temporary files are removed when the run finishes or a check fails.

The existing Nx `test:e2e` target runs this same command in PR checks. Its inputs include the course and testing guide, framework dependencies, and checkpoint/mode selectors, so a selected local run cannot satisfy the cache for the complete course.

### Maintain checked examples

The data-loader and private-loader snippets carry `tested-source` comments. `pnpm test:docs` checks those snippets against the checkpoint files before application checks run. Keep each marked block as a contiguous excerpt of its source, and register new checked excerpts in `tests/check-docs.mjs`. Changes to either side must stay in sync.

Other fenced blocks explain commands or application-specific patterns. They are illustrative unless a source check explicitly covers them. Do not describe an illustrative fragment as verified by the course tests. Verify a framework API change with the complete `pnpm test:e2e` command; a compile failure or failing browser flow must block the change.

Vitest checks the final checkpoint's input schema without loading request context or connecting to PostgreSQL. The [testing guide](https://tanstack.com/start/latest/docs/framework/react/guide/testing) explains the boundary between those unit tests and the running application.

The final suite checks account isolation, session renewal and expiry, protected mutations, validation and rollback, server HTML, canonical URLs, sitemap exclusions, readiness, public-asset secrets, and a copied production artifact. The artifact test uses port 3148 and is skipped in development mode. The test runner supplies disposable databases; the tests also clean up their own records.

To start the final build locally with `.env`:

```sh
APP_ORIGIN=http://localhost:3147 PORT=3147 node --env-file=.env checkpoints/08-tests/.output/server/index.mjs
```

A host that injects environment variables can use `pnpm start:08` from the checkout, or copy the complete `.output` directory and run `node .output/server/index.mjs`. Apply migrations from the source checkout as a release step.

Local production checks do not verify hosting, DNS, TLS, mail delivery, or a remote deployment. Configure verification, recovery, rate-limit storage, and trusted proxy handling for your public service before opening registration to real users. See the [deployment chapter](https://tanstack.com/start/latest/docs/framework/react/tutorial/learn-start/deployment).
