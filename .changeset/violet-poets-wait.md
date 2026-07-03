---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/start-server-core': patch
---

Fix match loading consistency across client navigation, preloading, background reloads, server rendering, and hydration.

- `beforeLoad` context is now propagated to descendant loaders and components during background reloads, preloaded navigation, route re-entry while background work is still in flight, and error or notFound states.
- Redirects no longer use a renderable `RouteMatch.status`; `RouteMatch.status` is now `'pending' | 'success' | 'error' | 'notFound'`. Abandoned, redirected, or failed matches are dropped from cache and their readiness promises are settled so stale suspense work cannot keep rendering suspended.
- Route assets from `head` and `scripts` are projected from the committed match lane after loader data is current, including preloaded navigations, background reloads, and SSR hydration.
- Pending UI and `pendingMinMs` now remain owned by match loading, so long-running `beforeLoad` or loader work does not prematurely clear pending fallbacks.
- SSR hydration now handles dehydrated and data-only matches in a dedicated hydration pass, restoring route context and assets without rerunning client loaders.
- Server loading now has a dedicated path for status codes, redirects, notFound and error responses.
- React, Solid, and Vue match rendering now consume the simplified match readiness model, including aborted loader errors, SSR/data-only pending fallbacks, and stale render snapshots.
- Awaiting `router.load()` or `router.invalidate()` now settles only when the whole navigation chain settles, including superseded and redirected loads; preloads that borrow a pending-published foreground match wait for its commit instead of being dropped.
- Behavior change: a navigation that starts while a hover/intent preload for the same route is in flight no longer adopts the preload's loader run — the navigation runs its own loader with `preload: false` semantics, so loaders may execute twice in that window. Use your data layer (e.g. an external cache) to dedupe fetches.
- Preloads now cache the successful ancestor prefix even when a descendant throws an error or `notFound`, so repeated hovers do not re-run expensive ancestor loaders.
- Route chunk (lazy import) failures now run the normal route failure lifecycle: `onError` fires and thrown redirects/notFounds are honored. Error/notFound boundary chunks load independently of the route's other component chunks, and failed chunk preloads are retried on the next load instead of being cached forever.
- Server rendering keeps route `headers()` when a decorative `head()`/`scripts()` hook fails, background reloads never publish fresh `loaderData` whose asset projection failed, and hydration no longer executes `head()`/`scripts()` for matches the server omitted (`ssr: false` or a server-side error/notFound boundary).
