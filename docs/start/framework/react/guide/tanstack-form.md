---
id: tanstack-form
title: Forms and Mutations with TanStack Form
description: Use TanStack Form with Start server functions for field errors, pending state, optimistic updates, loader refresh, and navigation after saving.
---

TanStack Form owns field state and submission feedback. Start server functions validate and save the submitted values, and Router loaders read the saved result. The [working example](https://github.com/TanStack/router/tree/main/examples/react/start-form) connects those pieces in a small reading-goal form.

The example saves a non-sensitive preference in a per-browser cookie. It needs no database or account, and does not treat that cookie as authentication. For application records, authorize the caller and write through your database before reporting success.

## Choose a submission path

This guide uses `@tanstack/react-form` with `useServerFn`. The form requires JavaScript and disables its controls until hydration. Its HTML method is POST so a native submission cannot put entered values in the URL.

If you need a native form action that works without JavaScript, use the [Form Start integration](/form/latest/docs/framework/react/guides/ssr#using-tanstack-form-in-tanstack-start). That guide covers `@tanstack/react-form-start`, server validation state, and native submission. Do not mix its redirect-and-cookie validation flow into a client RPC handler without deciding how the response should be consumed.

## Validate at the write endpoint

`saveGoal` accepts a string, then validates its trimmed value before setting the cookie. The server rejects empty or overlong goals even when a caller bypasses the form. Known validation failures return a field message. Unexpected failures reach the client's failure handler.

Client validation makes the form easier to use, but does not authorize or validate a network request. The example deliberately checks only an empty string on the client so whitespace-only input demonstrates server validation.

The handler uses `private, no-store`, and the cookie is HTTP-only, SameSite Lax, and Secure on HTTPS. The example also enables Start's CSRF middleware for server-function requests. CSRF checks and account authorization solve separate problems; an application with accounts needs both.

## Put server errors next to their field

The form calls the server through `useServerFn(saveGoal)`. A validation result becomes a Form error:

```tsx
const result = await save({ data: value })
if (result.error) {
  formApi.setErrorMap({
    onSubmit: { fields: { goal: result.error } },
  })
  return
}
```

The input reads `field.state.meta.errors` and connects the error container with `aria-describedby`. Its entered value remains available for correction. See Form's [validation guide](/form/latest/docs/framework/react/guides/validation) for validator types and field-error APIs.

## Keep pending state through the refresh

`onSubmit` is async. `form.Subscribe` observes `isSubmitting` and disables the whole fieldset until the save, loader refresh, and optional navigation finish. Both save buttons share that state, so another submission cannot race the first one.

After a successful write, the example awaits `router.invalidate()`. This makes the loader read the newly saved cookie before the form reports **Saved.** A completed server request alone does not replace Router's loaded data.

The final page also reads its value through a loader. Reloading that page checks persistence independently of the form's local state.

## Make optimistic state temporary

Before the request, the component places the candidate goal in `optimisticGoal`. The preview renders that value while the request is pending, with the saved loader value underneath it.

On success, the loader refresh completes before the temporary value is cleared. On a validation or HTTP failure, `finally` clears the preview and shows the previously loaded goal. It preserves the input so the user can correct or retry it.

A failed response does not always mean a write failed. The server might have committed a write before the connection broke. The failure message therefore asks the user to reload and check, rather than claiming that storage is unchanged. Important or non-idempotent mutations need their own retry and idempotency policy.

## Navigate only after saving

The two buttons use Form's submission metadata. **Save** keeps the user on the form. **Save and continue** calls:

```tsx
void form.handleSubmit({ redirect: true })
```

`onSubmit` reads `meta.redirect` and navigates to `/saved` only after the server reports success and Router refreshes. Validation failures stay on the form. This is client navigation after an RPC submission; a native POST flow should return an appropriate redirect response instead.

See [Form submission handling](/form/latest/docs/framework/react/guides/submission-handling) for the metadata API and [Start server functions](./server-functions) for request and response behavior.

## Run the example and its checks

After the Router repository's dependency and framework build setup:

```sh
cd examples/react/start-form
pnpm dev
```

Open http://localhost:3150. Stop that server before running Playwright:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
FORM_PRODUCTION=1 pnpm test:e2e
```

The tests cover server field errors, a pending optimistic preview, persisted loader data, a second browser's separate preference, redirect after saving, and cross-site rejection. A test intercepts a submission with an HTTP 500 response to check rollback, preserved input, and retry. That failure fixture tests client behavior; it does not claim to exercise a database outage. Both runs check for uncaught browser errors.
