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
