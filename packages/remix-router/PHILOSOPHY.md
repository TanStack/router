# `@tanstack/remix-router` design notes

This binding mirrors `@tanstack/react-router`'s public surface 1:1 wherever it's portable, **but deliberately omits the parts that only make sense in React**, and replaces a few patterns with their Remix-native equivalents. This doc records what those choices are and why, so the next person to touch the code knows what was deliberate vs. accidental.

## What we deliberately do NOT ship

| Item | Why dropped |
|---|---|
| `'use client'` directives on every file | Server Components is a React/Next concept. Remix 3 doesn't have it; the directive is dead text and would confuse anyone reading the source. |
| `index.rsc.ts` (React Server Components entry) | Same — no RSC concept in Remix 3. Solid-router also drops this. |
| `react-server` export condition in `package.json` | Same. |
| `HeadContent.dev.tsx` (separate dev variant) | The dev variant exists in react-router for HMR-friendly head re-rendering. Remix 3's reconciler diffs head tags directly; one `HeadContent` is enough. |
| `React.memo` wrapping on `<Match>` and `<Outlet>` | The `remix/ui` factory model already runs setup once per instance, so re-renders are cheap by construction. `React.memo` would be a cargo-culted no-op. |
| `flushSync` from `react-dom` | React-DOM-only API. Remix 3's scheduler handles flushing via `handle.flush()`. |
| `forwardRef` for `<Link>` / `createLink` | `remix/ui` has a `ref()` mixin instead. Refs flow as part of `mix={[ref(setEl)]}`, not as a forwarded prop. |
| `useEffect` / `useLayoutEffect` distinction | `remix/ui` exposes `handle.queueTask(task)` and `handle.signal`. We use `queueTask` for both effect categories; the rendering scheduler decides timing. |
| `useSyncExternalStore` | The whole reactivity layer is built on `@tanstack/store` atoms + `subscribeStore` helpers; no need for the React shim. |
| Suspense-throwing in `<Await>` (and friends) | `remix/ui` has no Suspense. The Remix-flavored `<Await>` re-renders via `handle.update()` when the promise resolves. |

## What we ship that's worth highlighting

- **Setup-time accessors** — every `useX(handle, opts)` returns a getter `() => T`, called inside the render function. This matches the `remix/ui` factory pattern and removes rules-of-hooks.
- **`@tanstack/store` atoms for reactivity** — same atoms `react-router` uses internally, just without the React-store hook layer. The Remix component subscribes via `handle.update()` registered against the atom.
- **`Frame.addEventListener('error', …)` for boundary catch** — `remix/ui` doesn't have fiber-level error boundaries. We listen on the parent frame's error channel for runtime errors and a `try/catch` around render for synchronous ones.

## Patterns we're flagging for future work (Remix-native, but not yet adopted)

These are gaps where Remix 3 has a built-in primitive that would be a more natural fit than the directly-ported pattern. They're not bugs — the current code works — but they're places where a deeper rewrite would yield a leaner, more idiomatic binding.

### 1. `Frame`-based outlet rendering

`remix/ui` ships `<Frame src="…">` — a placeholder element whose content is loaded from a URL and replaced on `frame.replace()` / `frame.reload()`. Our `<Outlet>` instead reads `router.stores.matchesId` and renders a `<Match>` for the next id.

A Remix-native `<Outlet>` could be implemented as `<Frame src={childMatchUrl} />`, with the SSR pipeline emitting per-route frame templates. The runtime would replace the frame on navigation rather than re-rendering through the router's match tree.

Trade-off: simpler runtime, but needs the route component output to be addressable by URL — currently TSR loads route components ad-hoc from JS modules. Would need a route-manifest pass that maps URLs to module + export.

### 2. `clientEntry()`-based selective hydration

`remix/ui`'s `clientEntry(id, component)` marks a component as needing client-side hydration; everything else is SSR-only. The default for our binding is to hydrate the whole `RouterProvider` tree, which is the React idiom but defeats the benefit of Remix 3's selective hydration model.

A Remix-native binding would:
- Render route trees as static SSR HTML by default
- Mark `<Link>`, `<Form>`, `<MatchRoute>`, and any component using `useLoaderData()` as `clientEntry`
- Ship a much smaller client bundle (only interactive bits hydrate)

Implementation cost is high — we'd need a generator pass to identify interactive route components, plus a way to bridge the dehydrated payload to per-component props. Logged as the highest-leverage future change.

### 3. `remix/fetch-router` middleware composition

Currently `createRouterHandler` returns a single handler that owns all paths. If a Remix 3 app wants per-route middleware (sessions, auth, CSRF, file uploads), they layer them at the fetch-router level *outside* the TSR handler.

This works but means TSR routes can't directly declare middleware that participates in the fetch-router chain. A future seam: expose `route.options.serverMiddleware` that converts to fetch-router middleware automatically.
