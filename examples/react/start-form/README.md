# TanStack Form with Start

A reading-goal form with server validation, field errors, pending controls, an optimistic preview, loader refresh, and navigation after saving. The [Start form guide](https://tanstack.com/start/latest/docs/framework/react/guide/tanstack-form) explains the workflow.

Follow the Router repository's dependency and framework build setup, then run:

```sh
cd examples/react/start-form
pnpm dev
```

Open http://localhost:3150. The example stores a non-sensitive preference in a per-browser cookie. No database or account is required. It uses client RPC submission and requires JavaScript. The Form docs separately cover native form actions.

After stopping the dev server:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
FORM_PRODUCTION=1 pnpm test:e2e
```

Tests check server validation, pending preview, persistence, redirect, separate browser state, and CSRF. An intercepted HTTP 500 response verifies client rollback and retry. A failed response can leave a real write's result uncertain, so the UI asks the user to reload and check.
