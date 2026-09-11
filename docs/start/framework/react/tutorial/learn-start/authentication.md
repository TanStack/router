---
id: learn-start-authentication
title: Learn Start, Accounts and Private Notes
description: Add Better Auth accounts to TanStack Start, authorize database reads and writes, keep drafts private, and test session renewal and expiry.
---

Give each account its own drafts and let the owner choose which notes to publish. The [working checkpoint](https://github.com/TanStack/router/tree/main/examples/react/start-learn/checkpoints/05-authentication) is `checkpoints/05-authentication`.

## Prepare a separate database

The earlier checkpoints allow anonymous writes. Do not point them at a database containing private notes. Create a second PostgreSQL database, `learn_start_auth`, and add its connection string to the example's `.env`:

```dotenv
AUTH_DATABASE_URL="postgresql://start_demo:start_demo@localhost:5433/learn_start_auth"
BETTER_AUTH_SECRET=""
APP_ORIGIN="http://localhost:3144"
```

Use your actual database credentials and port. Keep `DATABASE_URL` pointing at the earlier `learn_start` database. Generate a secret with `openssl rand -base64 48` and paste it into `BETTER_AUTH_SECRET`. Keep `.env` out of Git.

From `examples/react/start-learn`, run:

```sh
pnpm db:generate:05
pnpm db:migrate:05
pnpm db:seed:05
pnpm exec vite checkpoints/05-authentication --port 3144
```

Open http://localhost:3144 and choose **My notes**. Create an account with a password of at least 12 characters. This checkpoint starts with two public sample notes; it does not transfer notes from the anonymous database.

## Let the auth library own credentials

`src/server/auth.server.ts` configures Better Auth with its Prisma adapter and email/password sign-in. The migration adds its user, account, session, and verification tables. `src/routes/api/auth/$.ts` forwards GET and POST requests to the library's handler.

The login component uses Better Auth's browser client. It does not hash passwords, create session tokens, or store credentials itself. The `tanstackStartCookies()` plugin is last in the server configuration so cookies set during server-side session reads reach the browser, including renewed session cookies.

The server requires an explicit `APP_ORIGIN` and a secret of at least 32 characters. Changing the port means updating the origin too. Later, use the deployment's HTTPS origin and a secret stored in the host's secret manager.

## Authorize every data operation

`currentUser()` reads the incoming session and returns only the user's ID, name, and email. It sets `Cache-Control: private, no-store`; session tokens stay on the server. `requireUser()` rejects unauthenticated requests with HTTP 401.

The dashboard's `beforeLoad` redirects visitors to `/login`, but that redirect is only a navigation convenience. Each protected server function calls `requireUser()` independently:

- Creating a note takes its owner ID from the session, never from submitted form data.
- Listing drafts filters by that owner ID.
- Reading a draft filters by both slug and owner ID.
- Publishing or unpublishing updates only a row matching both slug and owner ID. No matching row produces HTTP 404.

A second signed-in user cannot bypass these checks by copying the first user's request. The public list and detail functions read only rows where `isPublished` is true. New notes default to private.

## Keep publication explicit

Create a note from **My notes**. Its body is visible at its private draft URL, but `/notes/your-slug` returns 404 to an anonymous visitor. Choose **Publish**, then open that public URL in another browser session. Choose **Unpublish** and it returns 404 again.

Private pages use `noindex` and `private, no-store`. Neither directive replaces authorization. The database query is what prevents another account from reading the draft.

The private dashboard and draft loaders use `staleReloadMode: 'blocking'`. This prevents a previously visited private page from rendering cached data while a different account's request is checked. HTTP cache headers do not clear Router's in-memory loader data. Sign-in and sign-out invalidate the router so these loaders request the current account's data.

Create, publish, unpublish, and sign-out controls share pending state. This prevents overlapping actions while the route data refreshes. Sign-out clears the session through the auth client, invalidates route data, and returns to the login page.

## Keep origin checks and account checks separate

The checkpoint's Start middleware rejects cross-site server-function requests. Better Auth handles its own auth endpoints and origin checks. An authenticated cross-site request still needs to fail: being signed in does not prove that the user intended a write.

Conversely, an allowed same-origin request still needs an authenticated owner. A CSRF check cannot decide which note an account may edit.

## Verify two accounts and expired sessions

Stop the development server and run:

```sh
COURSE_CHECKPOINT=05-authentication pnpm test:e2e
```

The test creates two temporary accounts and checks private reads, public publication, unpublication, another owner's rejected write, authenticated cross-site rejection, and rejected requests after sign-out. It also moves a session near expiry to check cookie renewal, then expires a session to check the login redirect. Test accounts and their notes are removed afterward.

This course uses local email/password accounts. Email verification, password recovery, mail delivery, and a deployment-wide rate-limit store are not configured here. Configure and test the account lifecycle your public service needs before opening registration to real users.

Next: [Make published notes discoverable](./seo).
