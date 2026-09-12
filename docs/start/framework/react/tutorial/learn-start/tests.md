---
id: learn-start-tests
title: Learn Start, Test the Complete Application
description: Test a complete TanStack Start app with Playwright, covering accounts, ownership, database rollback, server HTML, SEO, and production deployment behavior.
---

Run the earlier checks against one complete application. The [working checkpoint](https://github.com/TanStack/router/tree/main/examples/react/start-learn/checkpoints/08-tests) is `checkpoints/08-tests`. It preserves the deployment chapter's app and adds the combined tests in `tests/final-*.spec.ts`.

## Prepare the final checkpoint

Keep the account database and secret. Set `APP_ORIGIN` in `.env` to `http://localhost:3147` for manual development, then run:

```sh
pnpm db:generate:08
pnpm db:migrate:08
pnpm db:seed:08
COURSE_CHECKPOINT=08-tests pnpm test:e2e
pnpm build:08
COURSE_PRODUCTION=1 COURSE_CHECKPOINT=08-tests pnpm test:e2e
```

Run these commands from `examples/react/start-learn`. Install Playwright's Chromium browser with `pnpm exec playwright install chromium` if it is not already installed. Stop any manually started checkpoint server before running tests; Playwright owns the server for each test run.

The schema is unchanged from the account chapter. The seed adds public sample notes if they are absent. Use a disposable local or test database, not a production database. Tests create and remove temporary records, and they deliberately alter their test accounts' session expiry times.

## Check boundaries, not only button clicks

| Test file                      | What it proves                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `final-authentication.spec.ts` | Account creation and sign-in, private drafts, owner-filtered reads and writes, publication, cross-site rejection, sign-out, renewal, expiry, duplicate-slug transaction rollback, and server-side validation. |
| `final-seo.spec.ts`            | Titles, descriptions, canonical URLs, links, and content without JavaScript; sitemap exclusions; real 404s; unpublication; private redirect caching.                                                          |
| `final-deployment.spec.ts`     | Database readiness and direct server HTML; public-asset secret checks and copied-artifact startup in production mode.                                                                                         |

The account test replays actual browser requests. It sends an authenticated write with cross-site metadata, then repeats an owner's request from another signed-in account. Those checks distinguish CSRF protection from ownership authorization. A test that only checks for a login redirect would miss both failures.

The duplicate-slug check submits a new category with an existing slug, then queries PostgreSQL to prove the transaction rolled the new category back. A visible error alone would not prove that the database stayed consistent.

The SEO test disables JavaScript. The deployment test starts the generated Node entry point. Development-only browser success does not prove either server HTML or production behavior.

## Run validation unit tests

```sh
pnpm test:unit
```

These Vitest tests import the final checkpoint's `noteInput` schema without starting the server or database. They check trimming, invalid slugs, blank fields, and title length. The browser suite still submits invalid input through the real server function, so it can catch a handler that stops using the validator. See the [testing guide](../../guide/testing) to add these tools to another Start application.

## Keep test data separate

Tests use unique record names and remove their own accounts, notes, and categories in `finally` blocks. Earlier anonymous checkpoints use `DATABASE_URL`; account checkpoints use `AUTH_DATABASE_URL`. Keep those databases separate so an earlier anonymous app cannot expose private data created later.

Do not point a test suite at a hosted customer database. If a test fails before cleanup completes, use its unique record prefix to inspect and remove its fixtures from the test database.

## Run an earlier checkpoint independently

`COURSE_CHECKPOINT` selects one server and its matching test files. It does not start every chapter's app.

| Checkpoint          | Port | Test command                                        |
| ------------------- | ---- | --------------------------------------------------- |
| `01-setup`          | 3140 | `COURSE_CHECKPOINT=01-setup pnpm test:e2e`          |
| `02-routes`         | 3141 | `COURSE_CHECKPOINT=02-routes pnpm test:e2e`         |
| `03-data`           | 3142 | `COURSE_CHECKPOINT=03-data pnpm test:e2e`           |
| `04-forms`          | 3143 | `COURSE_CHECKPOINT=04-forms pnpm test:e2e`          |
| `05-authentication` | 3144 | `COURSE_CHECKPOINT=05-authentication pnpm test:e2e` |
| `06-seo`            | 3145 | `COURSE_CHECKPOINT=06-seo pnpm test:e2e`            |
| `07-deployment`     | 3146 | `COURSE_CHECKPOINT=07-deployment pnpm test:e2e`     |
| `08-tests`          | 3147 | `COURSE_CHECKPOINT=08-tests pnpm test:e2e`          |

Before testing a database chapter, run its client generation and migration commands. Before adding `COURSE_PRODUCTION=1`, build that checkpoint. For example, checkpoint 04 uses `pnpm exec vite build checkpoints/04-forms` followed by `pnpm exec tsc -p checkpoints/04-forms`.

The deployment artifact check also uses port 3148 for its temporary server. It runs only in production mode, so the development suite reports that check as skipped.

## Make changes with a failing case in mind

When changing publication rules, add an assertion for a note that must remain private. When changing sessions, check a revoked or expired session. When changing a loader, inspect its direct HTML response as well as client navigation. Add a test because it catches a plausible failure, not because a new function needs a matching test file.

Return to the [course index](../learn-start) before extending the app for real users. Hosted deployment and account operations still need the checks described in the [deployment chapter](./deployment).
