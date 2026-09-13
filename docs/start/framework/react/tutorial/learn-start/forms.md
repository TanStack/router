---
id: learn-start-forms
title: Learn Start, Create Notes with a Validated Form
description: Add a TanStack Start form with server validation, pending and error feedback, transaction rollback, CSRF protection, and refreshed loader data.
---

Add writes to the same notes database. The [working checkpoint](https://github.com/TanStack/router/tree/main/examples/react/start-learn/checkpoints/04-forms) is `checkpoints/04-forms`. This checkpoint is still a shared local notebook with no accounts. Keep it local until the authentication chapter adds endpoint authorization.

## Prepare this checkpoint

Keep the database and `.env` from the previous chapter. Generate the client for the new source directory and apply the same migration history:

```sh
pnpm db:generate:04
pnpm db:migrate:04
pnpm exec vite checkpoints/04-forms --port 3143
```

Open http://localhost:3143. The two seeded notes remain, and the list now has a **Create a note** form. If you started here with a new database, run `pnpm db:seed:04` too.

## Validate at the endpoint

The new `createNote` server function uses POST and a Zod validator. It accepts four fields:

- `slug`: lowercase letters and digits separated by hyphens, at most 80 characters.
- `title`: 1 to 120 characters after trimming.
- `body`: 1 to 5,000 characters after trimming.
- `category`: 1 to 40 characters after trimming.

The form mirrors these limits where HTML can express them. The server validator remains necessary because callers can bypass the form. A title containing only spaces passes HTML's `required` check but must fail the server validator.

The checkpoint's `src/start.ts` keeps CSRF middleware enabled for server-function requests. Same-origin form calls work; a replay marked as cross-site receives HTTP 403. Authentication in the next chapter will add a separate check for who may write.

## Keep related writes in one transaction

A note needs a category. The handler uses a Prisma transaction to upsert the category and then insert the note. If the note's slug already exists, the database rejects the second write and rolls back the first.

Try creating a note with an existing slug and a new category name. The UI should say **That slug is already used. Choose another one.** The unused category should not remain in the database. This is why catching the error around two unrelated writes would be insufficient.

Only the known unique-constraint error becomes that specific response. An unexpected database failure gets generic UI feedback, while the server can retain diagnostic information. Avoid returning raw exception objects to the browser.

## Keep the form pending through the refresh

The component calls `createNote` through `useServerFn`. On success it awaits `router.invalidate()` so the route's database loader refreshes before the form becomes available again. A successful request alone does not update Router-owned loader data.

The handler captures `event.currentTarget` before awaiting anything, reads its `FormData`, and resets the form only after a successful write and refresh. Validation or duplicate-slug errors leave the entered values available for correction.

The fieldset is disabled until hydration and while the mutation is pending. The form uses `method="post"` so native submission cannot put its values into the URL. This implementation requires JavaScript; a progressively enhanced form needs an explicit native POST response path.

## Check success and failure

Create a note, then reload the page and open its detail link. The new body should come from PostgreSQL. Try the same slug again with a different category, and then try a title made of spaces.

Stop the development server and run:

```sh
COURSE_CHECKPOINT=04-forms pnpm test:e2e
```

The tests check persisted server HTML, reloads, duplicate-slug rollback, server-side whitespace validation, and cross-site rejection. They also check that the HTML does not contain the configured database URL or password. Build-time client asset inspection remains part of the deployment checks.

Next: [Add accounts and protect writes](./authentication).
