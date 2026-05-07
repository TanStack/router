# `@tanstack/remix-start` design memo

This is a forward-looking note about what TanStack Start should look like on Remix 3, scoped against the existing `react-start` / `solid-start` / `vue-start` shape and Remix 3's own toolkit.

> Status: design only. No code in this package yet — see `packages/remix-start/` for the skeleton + `createServerFn` POC referenced below.

## What Start adds on top of the router

The framework-agnostic core split looks like this:

| Layer | Responsibility |
|---|---|
| `@tanstack/router-core` | Match resolution, loaders, `before-load` chain, navigation |
| `@tanstack/<framework>-router` | Reactivity binding + view components for a given UI runtime |
| `@tanstack/<framework>-start` | Full-stack pipeline: SSR handler, server functions, build plugin, manifest |

For Remix 3, the equivalents are:

| Layer | Already on Remix 3? |
|---|---|
| Routing | **No** — Remix 3 ships `fetch-router` (URL → handler) but not match-tree resolution. Filled by `@tanstack/remix-router`. |
| Reactivity binding | **No** — `@tanstack/remix-router` binds `RouterStores` to `handle.update()`. |
| SSR pipeline | **Partial** — Remix 3's `fetch-router` + `@remix-run/ui/server`'s `renderToStream` cover transport. Remix 3 doesn't ship match-tree dehydration; `@tanstack/remix-router/server` does. |
| Server functions (RPC) | **No** — Remix 3 has form-data-parser, file-storage, sessions, but no typed RPC. Would be Start's distinctive piece. |
| Build plugin / asset manifest | **No** — Remix 3 deliberately avoids build-time magic. Vite is the convention. |
| Code splitting | **Partial** — `@remix-run/ui`'s `clientEntry()` provides the runtime contract; the bundler integration is BYO. |
| File-based routing | **Partial** — `@tanstack/router-generator` works as-is. |
| Middleware (sessions/auth/forms) | **Yes** — Remix 3 ships these as standalone packages; compose at the fetch-router layer. |

## Where `@tanstack/remix-start` would live

The shape mirrors `@tanstack/react-start`:

```
packages/
├── remix-router/              ← we're here today
└── remix-start/               ← the future
    ├── src/
    │   ├── index.ts           — re-export remix-router + start glue
    │   ├── createServerFn.ts  — RPC function definition (client-shape)
    │   ├── serverFnHandler.ts — runtime dispatcher (server-shape)
    │   ├── createStart.ts     — instance factory; merges middleware + plugins
    │   ├── createStartHandler.ts — server entry: fetch-router + TSR + RPC
    │   ├── createMiddleware.ts   — global request middleware
    │   ├── plugin/
    │   │   ├── index.ts       — Vite plugin export
    │   │   ├── compiler.ts    — babel/swc transform for createServerFn calls
    │   │   ├── manifest.ts    — virtual-module manifest + asset table
    │   │   └── client-entry.ts — ClientLink chunk-splitter (covered below)
    │   └── ssr/
    │       ├── client.ts      — RouterClient + hydration entry
    │       └── server.ts      — RouterServer + handler exports
    └── package.json
```

The package would depend on `@tanstack/remix-router` (peer), `@tanstack/start-client-core`, `@tanstack/start-server-core`, `@remix-run/fetch-router`, and `@remix-run/ui`.

## Key design choices

### 1. Reuse `@tanstack/start-server-core` for `handleServerAction`

The server-functions handler in `packages/start-server-core/src/server-functions-handler.ts` is mostly framework-agnostic:

```ts
export const handleServerAction = async ({
  request,
  context,
  serverFnId,
}): Promise<Response> => { … }
```

It takes a Web `Request`, dispatches by `serverFnId`, runs the registered handler, and returns a Web `Response`. Nothing React-specific. We register it as a fetch-router route at `${TSS_SERVER_FN_BASE}/{*path}`:

```ts
import { createRouter } from '@remix-run/fetch-router'
import { handleServerAction } from '@tanstack/start-server-core'

const app = createRouter()
app.route('ANY', `${SERVER_FN_BASE}/*serverFnId`, ({ request, params }) =>
  handleServerAction({ request, serverFnId: params.serverFnId, context: {} }),
)
app.all('/*', tsrHandler)
```

This is the single biggest piece we get for free — no need to reimplement RPC dispatch, serialization, middleware chaining, or framing.

### 2. Reuse `createServerFn` from `@tanstack/start-client-core`

`createServerFn` is the user-facing RPC primitive:

```ts
export const listUsers = createServerFn().handler(async () => {
  return await db.users.findMany()
})
```

It compiles to:
- **Server bundle**: the original handler function, registered under a generated `serverFnId`
- **Client bundle**: a fetcher `() => fetch(SERVER_FN_BASE + serverFnId)` that calls the server endpoint

Both bundles are produced by the build-time compiler. The runtime contract (`createServerFn(options).handler(fn)` → returns a callable fetcher) is in `start-client-core`. We ship the same factory; the build pipeline does the splitting.

### 3. Vite plugin: shared core, Remix-specific entry detection

`@tanstack/start-plugin-core` already knows how to:
- Detect `createServerFn(...).handler(fn)` calls (via `start-compiler`)
- Split client/server bundles
- Generate the route manifest
- Wire virtual modules

What's Remix-specific:
- The compiler should ALSO detect `clientEntry(id, fn)` calls (the `remix/ui` selective-hydration primitive) and split those too.
- The manifest must include a map from `clientEntry` IDs to chunk URLs, so the SSR `resolveClientEntry` callback can return real URLs.
- The dev server must register the fetch-router app as Vite's middleware.

This is a thin layer over `@tanstack/start-plugin-core` — we reuse the compiler hooks and just add the `clientEntry` detection + manifest entries.

### 4. Composition with Remix 3's modular packages

A user's `server.ts` would look like:

```ts
import { createRouter } from '@remix-run/fetch-router'
import { createSession } from '@remix-run/session'
import { csrf } from '@remix-run/csrf-middleware'
import { createStartHandler } from '@tanstack/remix-start/server'
import { router } from './app/router'

const startHandler = createStartHandler({
  createRouter: () => router,
  // Other Start options: middleware, serializationAdapters, etc.
})

const app = createRouter()
app.use(csrf())                         // Remix 3 middleware
app.use(createSession({ secret: '…' })) // Remix 3 middleware
app.all('/*', startHandler)             // TSR + RPC under one handler

export default { fetch: app.fetch }
```

This is the heart of the integration: TanStack Start does the framework work; Remix 3's modular packages do the platform work; they meet at fetch-router.

### 5. Code splitting via `clientEntry`

The killer feature when this all lands: routes ship as **mostly-static SSR HTML** with only `<Link>`, `<Form>`, and explicitly-marked components hydrating client-side.

Today our `examples/remix/basic` example produces (production build, all routes including lazy chunks):

| Metric | Raw | Gzip |
|---|---|---|
| Total client JS (all chunks) | 296 kB | 64 kB |
| Initial entry (`index` + `useRouter`) | ~140 kB | ~46 kB |
| Per-route lazy chunks | 0.5–7 kB each | 0.2–3 kB each |
| Server bundle | 556 kB | — |

Initial-load gzip (~46 kB) is dominated by the router runtime + Remix UI reconciler. With clientEntry-based selective hydration, a typical route would ship:

- The `clientEntry` runtime (~8 kB from `@remix-run/ui`)
- Just the chunks for marked-as-interactive components (~5–20 kB depending on usage)
- The router-core navigation logic (~30 kB) needed to drive `<Link>` clicks
- **No** route component code paths for static pages

Estimated bundle for a clientEntry-only app: ~40–60 kB raw / ~15–20 kB gzip for a typical CRUD app. ~3x smaller than the full-tree hydration path. (See `examples/remix/islands` for a working pure-Remix-3 island demo using `@remix-run/ui` directly without TanStack Router.)

## What we ship today vs. what Start would add

What's already in `@tanstack/remix-router`:

- `createRouterHandler` (server entry, fetch-router compatible)
- `RouterClient` + `RouterServer` (SSR entries)
- `mountRouter` (client boot + hydrate)
- `ClientLink` (selective-hydration primitive)
- `setActiveRouter` / `getActiveRouter` (singleton for clientEntry components)

What `@tanstack/remix-start` would add:

| Piece | Source |
|---|---|
| `createServerFn` | Reuse from `@tanstack/start-client-core` |
| `createMiddleware` | Reuse from `@tanstack/start-client-core` |
| `createStart` (instance factory) | Reuse from `@tanstack/start-client-core` |
| `createStartHandler` (server entry) | New — combines existing `@tanstack/remix-router/server`'s `createRouterHandler` with `handleServerAction` from `@tanstack/start-server-core`. ~50 lines. |
| Vite plugin | New — wraps `@tanstack/start-plugin-core` and adds `clientEntry` chunk emission + manifest entries. ~200 lines. |
| Asset manifest | Reuse `@tanstack/start-plugin-core`'s manifest format; add a `clientEntries` field. |
| Dev server middleware | New — registers the fetch-router app under Vite's middleware mode. ~30 lines. |

**Total estimated new code**: ~500 LOC of glue, plus the manifest format extension. Smaller than `@tanstack/remix-router` itself.

## Order of operations

1. **`clientEntry` Vite plugin** (in this package) — needed for the runtime to actually find chunks. No Start dependency.
2. **Per-route `serverMiddleware` bridge** (in this package) — small addition, ports the React Start route-middleware concept.
3. **`@tanstack/remix-start` skeleton** — package shell + `createServerFn` POC + `createStartHandler` that wraps `createRouterHandler` and registers `handleServerAction`. Demonstrates the full flow.
4. **Vite plugin for Start** — extends `@tanstack/start-plugin-core` with Remix-specific bits (the clientEntry plugin from step 1 + dev-server registration).
5. **End-to-end Start example** — `examples/remix/start-basic` showing server functions, file-based routing, sessions, and a real Vite dev/build cycle.

Steps 1–3 are local to this PR/branch and represent ~80% of the total effort. Steps 4–5 are follow-up packages.
