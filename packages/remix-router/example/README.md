# `@tanstack/remix-router` example

End-to-end demo of TanStack Router rendering through `@remix-run/ui` and serving through `@remix-run/fetch-router`.

## What's here

- `src/routes/` — the route tree (root, `/`, `/users`, `/users/$id`)
- `src/router.ts` — `makeRouter()` factory used by both client and server entries
- `src/entry.client.tsx` — boots the router in the browser, mounts via `createRoot()`
- `server.mjs` — fetch-router app that mounts the TSR handler at `'/{*path}'` and serves through `@remix-run/node-serve`

## Run

This example is a structural sketch — it depends on Remix 3 beta packages that may not yet be installed in the workspace. Install just the example's deps and run:

```bash
cd packages/remix-router/example
pnpm install
node ./server.mjs
```

Then open http://localhost:3000.

## Status

This proves the integration shape on paper. The pieces that are exercised:

- TanStack Router core + reactivity adapter (`@tanstack/store` atoms ↔ `handle.update()`)
- View binding: `RouterProvider`, `Match`, `Outlet`, `Link`
- Setup-time accessors: `subscribeMatch` for loader data
- Server handler integrated with `@remix-run/fetch-router` and SSR'd via `@remix-run/ui/server`'s `renderToStream`

The pieces that are *not* yet exercised and need follow-up:

- Streaming (`<Frame>` / pending boundary)
- `clientEntry`-based selective hydration (today this CSR-mounts the whole tree)
- File-based routing codegen (the example uses code-defined routes)
- Forms / actions / Remix 3 middleware composition
