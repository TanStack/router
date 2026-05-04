# `@tanstack/remix-start` (experimental skeleton)

Full-stack framework on top of [`@tanstack/remix-router`](../remix-router) and [Remix 3](https://remix.run/blog/remix-3-beta-preview).

> [!WARNING]
> This is a forward-looking skeleton, not a finished package. The pieces here today demonstrate the integration shape; the build plugin, dev-server middleware, and end-to-end example still need work. The full design lives in [`packages/remix-router/START.md`](../remix-router/START.md).

## What's here today

- `@tanstack/remix-start` re-exports everything from `@tanstack/remix-router`, so apps can use a single entry point.
- `createServerFn`, `createMiddleware`, `createIsomorphicFn`, `serverOnly`, `clientOnly`, `createStart` — re-exported verbatim from `@tanstack/start-client-core`. Same RPC primitives the React/Solid Start packages ship.
- `@tanstack/remix-start/server` exports `createStartHandler` and `createStartApp` — server entries that combine the TanStack Router SSR pipeline with the framework-agnostic server-function dispatcher (`handleServerAction` from `@tanstack/start-server-core`).

## What's not here yet

- **Vite plugin** for the build-time `createServerFn` transform (compile away `.handler(fn)` to a client-side fetcher) and the `clientEntry` chunk-splitter.
- **Dev-server middleware** that registers the fetch-router app under Vite's middleware mode for HMR.
- **End-to-end example** at `examples/remix/start-basic` exercising server functions, file-based routing, sessions, and a real Vite dev/build cycle.

These are documented as Phase-2 work in the design memo.

## Quick shape

```ts
// app/api.ts
import { createServerFn } from '@tanstack/remix-start'

export const listUsers = createServerFn().handler(async () => {
  return await db.users.findMany()
})

// app/server.ts
import { createRouter } from '@remix-run/fetch-router'
import { csrf } from '@remix-run/csrf-middleware'
import { createStartHandler } from '@tanstack/remix-start/server'
import { router } from './router'

const startHandler = createStartHandler({ createRouter: () => router })

const app = createRouter()
app.use(csrf())
app.all('/*', startHandler)

export default { fetch: app.fetch }
```
