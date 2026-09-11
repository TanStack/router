---
id: testing
title: Testing TanStack Start with Vitest and Playwright
description: Test TanStack Start input validation, server functions, navigation, forms, authentication, and server-rendered HTML with Vitest and Playwright.
---

Use Vitest for code that can run without an HTTP request. Use Playwright against a running Start application for server functions, cookies, redirects, SSR, and navigation. A passing unit test does not prove that the browser can call a server function or that its request is authorized.

The [Learn Start example](https://github.com/TanStack/router/tree/main/examples/react/start-learn) contains both setups. Its final checkpoint has accounts, private drafts, public notes, and PostgreSQL transactions. Follow the [course setup](../tutorial/learn-start) for the database and environment variables, then use [the final checkpoint's commands](../tutorial/learn-start/tests) to run the complete application tests.

## Add Vitest without starting the application

In your project, install the runners:

```sh
pnpm add -D vitest @playwright/test
pnpm exec playwright install chromium
```

Create a separate `vitest.config.ts`. This configuration tests plain TypeScript in Node and does not load the application's Start or deployment plugins. Vitest gives its [dedicated configuration](https://vitest.dev/config/) priority over `vite.config.ts`.

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

Keep browser tests named `*.spec.ts` and unit tests named `*.test.ts` so the runners do not collect each other's files. Add `"test:unit": "vitest run"` and `"test:e2e": "playwright test"` to your package scripts.

## Test the input used by a server function

A validator can live in a module that imports no request context, database connection, or environment secret. The course's final checkpoint exports `noteInput` from `src/server/note-input.ts` and passes that exact schema to `createNote`:

The [working handler](https://github.com/TanStack/router/blob/main/examples/react/start-learn/checkpoints/08-tests/src/server/notes.ts) uses `.validator(noteInput)`, checks the session, and writes inside a transaction.

The [unit tests](https://github.com/TanStack/router/blob/main/examples/react/start-learn/tests/note-input.test.ts) reject path-like slugs, blank fields, and oversized titles, and check that readable fields are trimmed. Run them from the example directory:

```sh
pnpm test:unit
```

Importing the schema proves its validation rules. It does not prove that the handler still uses the schema, checks ownership, or rolls back a failed transaction. Those assertions belong in application tests.

Do not treat a direct import of a `createServerFn` export into a plain Node test as an HTTP integration test. Start transforms server functions, and request APIs such as session access need an active request. Run the actual application when those boundaries are part of the behavior being tested.

## Start the app from Playwright

For a Vite-based project with a `dev` script, this `playwright.config.ts` starts the development server and waits for it before testing:

```ts
import { defineConfig } from '@playwright/test'

const baseURL = 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: { baseURL, browserName: 'chromium' },
  webServer: {
    command: 'pnpm dev --port 3000 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

Use a dedicated test database. Set the application's expected origin to the same URL when authentication or CSRF checks depend on it. Playwright's [web server options](https://playwright.dev/docs/test-webserver) also support running a production server. Build first, then use the start command for your deployment adapter, not an assumed output path.

The course's configuration selects a checkpoint with `COURSE_CHECKPOINT`. For the routing example, which needs no database:

```sh
COURSE_CHECKPOINT=02-routes pnpm test:e2e
```

Its test opens a filtered list, follows a typed link, checks the detail URL and heading, goes back, and checks that the search value survived. It also requests an unknown note directly and asserts HTTP 404. Checking only the final heading would miss a broken URL or a lost search parameter.

## Exercise server functions through real requests

Use the application UI to create the request, then assert the result in the browser and storage. The final course checkpoint covers these boundaries:

| Behavior                | Assertion                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Server input validation | Submit a whitespace-only title, which passes the browser's required-field check, and verify server rejection and no stored record. |
| Authentication          | Request a private page while signed out, sign in, reload, sign out, and verify the private page is denied again.                   |
| Authorization           | Replay an owner's request from another signed-in account and verify the private record is neither readable nor changed.            |
| CSRF                    | Send a write with authenticated cookies and cross-site request metadata, then verify rejection and unchanged data.                 |
| Transaction failure     | Submit a duplicate slug with a new category and check PostgreSQL to prove both writes rolled back.                                 |
| Session lifecycle       | Check renewed sessions and expired sessions separately.                                                                            |

See [final-authentication.spec.ts](https://github.com/TanStack/router/blob/main/examples/react/start-learn/tests/final-authentication.spec.ts) for the complete requests, setup, and cleanup. Capture the generated server-function URL from the running app rather than hard-coding a compiler-generated function identifier.

Keep fixture names unique and remove records in `finally` blocks. A failed assertion should not leave data that makes the next run pass or fail for the wrong reason.

## Check server HTML separately from client navigation

A browser can hide missing SSR by rendering content after JavaScript loads. Use a context with `javaScriptEnabled: false` for public content that must exist in the document response. Assert its heading, title, canonical URL, and links. Check HTTP status separately with Playwright's request client.

For private SSR pages, assert the cache policy as well as access control. For an intentional SPA, the initial document is a shared shell, so assert that it contains no private data and test the loaded application with JavaScript enabled. Do not require a server-rendered form from a SPA shell.

The [SEO test](https://github.com/TanStack/router/blob/main/examples/react/start-learn/tests/final-seo.spec.ts) checks public HTML without JavaScript, real 404s, and sitemap exclusions for private drafts. The [deployment test](https://github.com/TanStack/router/blob/main/examples/react/start-learn/tests/final-deployment.spec.ts) checks the built Node artifact and readiness endpoint.

## Prove a test can fail

Before relying on a new test, make a temporary change that violates its assertion. Change a note link to the wrong destination and run the routing test. Remove server-side input validation and run the authenticated invalid-input check. Each should fail for the intended reason. Restore the implementation and rerun the same tests before committing.

Run the complete final checkpoint in both development and production using the [course test commands](../tutorial/learn-start/tests). Production checks matter because transforms, emitted assets, and server entry points differ from the development server.
