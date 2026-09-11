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
COURSE_CHECKPOINT=08-tests pnpm test:e2e
pnpm build:08
COURSE_PRODUCTION=1 COURSE_CHECKPOINT=08-tests pnpm test:e2e
```

`COURSE_CHECKPOINT` starts only the selected app and runs its matching tests. Without it, tests select `01-setup`. Generate the selected database checkpoint's client before testing. Production tests require its current build.

The final suite checks account isolation, session renewal and expiry, protected mutations, validation and rollback, server HTML, canonical URLs, sitemap exclusions, readiness, public-asset secrets, and a copied production artifact. The artifact test uses port 3148 and is skipped in development mode. Use disposable test databases; these tests write and clean up their own fixtures.

To start the final build locally with `.env`:

```sh
APP_ORIGIN=http://localhost:3147 PORT=3147 node --env-file=.env checkpoints/08-tests/.output/server/index.mjs
```

A host that injects environment variables can use `pnpm start:08` from the checkout, or copy the complete `.output` directory and run `node .output/server/index.mjs`. Apply migrations from the source checkout as a release step.

Local production checks do not verify hosting, DNS, TLS, mail delivery, or a remote deployment. Configure verification, recovery, rate-limit storage, and trusted proxy handling for your public service before opening registration to real users. See the [deployment chapter](https://tanstack.com/start/latest/docs/framework/react/tutorial/learn-start/deployment).

## SEO example

Checkpoint 06 adds structured data, a shared PNG social cover, and permanent redirects alongside canonical URLs, sitemap.txt, robots.txt, and publication checks. Checkpoints 07 and 08 keep the same behavior. `pnpm social:image` regenerates the checked-in 1200 by 630 cover from `artwork/notebook.svg` using Sharp. Both artwork formats are MIT-licensed with the repository. The asset is served statically; no image-service account is required.

The SEO tests run with an HTML-limited crawler, verify the actual PNG dimensions, and check that script-like note text remains data in both server HTML and client navigation. Generic CreativeWork metadata is not a promise of search-engine rich results.
