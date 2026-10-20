---
id: ssr-data-transport
title: SSR Data Transport
---

During the initial request the server runs the route lifecycles (`context`, `beforeLoad`, `loader`) and renders the page. Some of their results travel to the browser inside the HTML payload so the client can restore them during hydration instead of running the lifecycle again. This page describes what is sent by default, how to change it per lifecycle, and what the build removes from each bundle.

The lifecycles themselves (order, caching, `revalidate`) are documented in the Router docs: [Router Context](/router/latest/docs/framework/react/guide/router-context) and [Data Loading](/router/latest/docs/framework/react/guide/data-loading). Which lifecycles run on the server at all is controlled by [Selective SSR](./selective-ssr.md).

> **Experimental:** the route `context` option and the `dehydrate` and `hydrate` keys of `beforeLoad` and `loader` are experimental and subject to change.

## What crosses the wire

| Lifecycle    | Runs on the server | Result sent to the client by default | Change it with                                 |
| ------------ | ------------------ | ------------------------------------ | ---------------------------------------------- |
| `context`    | yes                | no                                   | `dehydrate: true`, or `dehydrate` + `hydrate`  |
| `beforeLoad` | yes                | yes                                  | `dehydrate: false`, or `dehydrate` + `hydrate` |
| `loader`     | yes                | yes                                  | `dehydrate: false`, or `dehydrate` + `hydrate` |

`context` is not sent because it usually holds values that cannot be serialized, such as query options or a client instance. The client computes it again during hydration.

A result that is sent is restored from the payload on the client; the handler does not run again. A result that is not sent is recomputed on the client during hydration: `context` and `beforeLoad` run route by route, parent first, in the same order the server used, and then the loaders start in parallel. What happens when one of these runs fails is described in [When a lifecycle fails during hydration](#when-a-lifecycle-fails-during-hydration).

All of this is configured in the object form of the lifecycle:

```tsx
loader: {
  handler: () => fetchPosts(),
  dehydrate: false,
}
```

A sent result has to be serializable. In a Start app TypeScript checks the return type of every transported lifecycle and reports an error when it is not. There are three ways to fix such an error: return serializable data, set `dehydrate: false`, or register a [serialization adapter](./serialization-adapters.md) for the type.

## `dehydrate: false`

The server still runs the lifecycle (it needs the value to render and to feed child routes), but the result stays on the server. The client runs the lifecycle again during hydration.

```tsx
// src/routes/editor.tsx
export const Route = createFileRoute('/editor')({
  ssr: 'data-only',
  beforeLoad: {
    handler: () => ({ editorSession: createEditorSession() }),
    dehydrate: false,
  },
})
```

On a route with `ssr: true` the client's run must produce the same value the server used. The server rendered HTML with its value; if the client comes up with a different one, the first client render differs from the HTML and you get a [hydration mismatch](./hydration-errors.md). When the value cannot be the same on both sides, pair `dehydrate: false` with `ssr: 'data-only'` as in the example: the lifecycle still runs on the server, but the component is not rendered there.

`dehydrate: false` is the default for `context`, so a plain `context` function is already in this situation; for an async one, writing it out also silences a development warning (see the end of the next section). A context derived from `params` or `deps` produces the same value on both sides and needs nothing extra.

## Sending a context: `dehydrate: true`

A `context` whose result is serializable can be sent. The typical case is an auth lookup that should run once per match and not again on every client navigation:

```tsx
// src/routes/_authed.tsx
export const Route = createFileRoute('/_authed')({
  context: {
    handler: async ({ context }) => ({
      session: await context.auth.getSession(),
    }),
    dehydrate: true, // send it; the result is serializability-checked
    revalidate: true, // re-run on router.invalidate() (login/logout)
  },
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
  },
})
```

The server runs the handler, the client restores `session` from the payload and keeps it for the lifetime of the match. Without `revalidate` a context never re-runs on `router.invalidate()`; with `revalidate: true` the handler runs again on the client when you call it. See [Router Context](/router/latest/docs/framework/react/guide/router-context) for the caching rules.

If a `context` handler is async and its result is not sent, the client awaits it again during hydration. In development the server warns about this once per route. Set `dehydrate: true` when the result is serializable; when it is not, write `dehydrate: false`, which keeps the behavior and silences the warning.

## Custom `dehydrate` and `hydrate`

When the value the app needs is not the value you want on the wire, write the two halves yourself:

- `dehydrate` runs on the server after the handler settles. It receives route `context`, passive lifecycle metadata and `data`, the handler's awaited result, and returns the wire value. The wire value is what has to be serializable. A `dehydrate` whose return type is `unknown` is rejected in a Start app; give it a concrete return type.
- `hydrate` runs on the client during hydration. It receives route `context`, passive lifecycle metadata and `data`, the wire value, and returns the value the app uses.

Both functions transform values and may be async. Their supported API includes `data`, `context`, `params`, `location`, `cause` and `preload`. Context codecs also receive `deps`, `matches` and `routeId`; `beforeLoad` codecs receive `search`, `matches` and `routeId`; loader codecs receive `deps` and `route`. TanStack Start provides `serverContext` on the server; it is `undefined` on the client. Navigation, cancellation and waiting for parent loaders belong in `handler`.

`context` contains the context available to the corresponding `handler`; `data` contains the lifecycle's result or wire value.

The first client render uses what `hydrate` returns. On a route with `ssr: true` that value must render the same HTML as the server's value, otherwise you get a [hydration mismatch](./hydration-errors.md). When it cannot, because `hydrate` adds a client-only field or returns another shape, add `ssr: 'data-only'` to the route, as the examples with client-only data below do.

Because `hydrate` sees the route's `context` and `params`, it can rebuild values that must never be serialized, such as query options, from a small wire payload:

```tsx
// src/routes/posts.$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  context: {
    handler: async ({ params }) => ({
      postId: params.postId,
      postQueryOptions: postQueryOptions(params.postId),
      authStatus: await getAuthStatus(),
    }),
    dehydrate: ({ data }) => ({
      postId: data.postId,
      authStatus: data.authStatus,
    }),
    hydrate: ({ data, context }) => ({
      postId: data.postId,
      postQueryOptions: postQueryOptions(data.postId), // may also use context.queryClient
      authStatus: data.authStatus,
    }),
  },
})
```

The server sends `{ postId, authStatus }`; the client rebuilds `postQueryOptions` and ends up with the same shape the handler returns. On client navigations the handler itself runs in the browser and neither half is involved.

### Reconstruct from the full value

If the default wire shape is fine and you only need a client-side step, keep `dehydrate: true` and add `hydrate`. `data` is then the handler's full result. A `hydrate` result that is assignable to the handler's data type is typed as the handler's data type, so a field that only exists on the client is declared by the handler as `undefined` and filled in by `hydrate`:

```tsx
// src/routes/report.tsx
export const Route = createFileRoute('/report')({
  ssr: 'data-only', // the client's timeZone differs from the server's
  loader: {
    handler: async () => ({
      report: await fetchReport(),
      timeZone: undefined as string | undefined, // client-only, set by hydrate
    }),
    dehydrate: true,
    hydrate: ({ data }) => ({
      ...data,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  },
})
// Route.useLoaderData(): { report: Report; timeZone: string | undefined }
```

A property that `hydrate` adds to an otherwise matching shape does not show up in `Route.useLoaderData()`; a `hydrate` result with a different shape is covered under [Narrow with a discriminant](#narrow-with-a-discriminant). The field is part of the handler's result, so with `dehydrate: true` it goes through the same serializability check as the rest of the value. On a client navigation the handler runs in the browser and `timeZone` stays `undefined`; the next section fills the field on that path too.

`dehydrate: true` is required next to `hydrate` so the transport is visible in the route file.

### Combine server data with client-only data

A loader handler is isomorphic: during SSR it runs on the server, during a client navigation it runs in the browser. Data that only exists in the browser (a preference in `localStorage`, for example) is added in two places: in `hydrate`, which runs at hydration, and in the handler's client branch, which runs on navigation. One `Data` type covers both; the client-only field is optional because it is `undefined` while the server renders.

```tsx
// src/routes/dashboard.tsx
import { createIsomorphicFn } from '@tanstack/react-start'

const getLocalPrefs = createIsomorphicFn()
  .server(() => undefined)
  .client(() => readPrefsFromLocalStorage())

export const Route = createFileRoute('/dashboard')({
  ssr: 'data-only', // prefs exist on the client only
  loader: {
    handler: async () => ({
      stats: await fetchStats(), // server fn: runs on the server during SSR, via fetch on client navigation
      prefs: getLocalPrefs(), // undefined on the server, filled on client navigations
    }),
    dehydrate: true,
    hydrate: ({ data }) => ({ ...data, prefs: readPrefsFromLocalStorage() }), // filled at hydration
  },
})
// Route.useLoaderData(): { stats: Stats; prefs: Prefs | undefined }
```

The server renders without `prefs` and the first client render has them, so the route needs `ssr: 'data-only'`. `createIsomorphicFn` is described in [Environment Functions](./environment-functions.md).

### Narrow with a discriminant

`hydrate` may also return a different shape than the handler. The loader's data type is then the union of the handler's data and the `hydrate` data, and the component narrows on a discriminant. One rule decides whether that union exists: a `hydrate` result that is assignable to the handler's data reduces to the handler's data. Only a result with a shape of its own produces the union.

That rules out server versus client as the discriminant. A handler that returns `env: isServer ? 'server' : 'client'` types `env` as `string` (the two literals widen), and with `as const` on both branches as `'server' | 'client'`. Either way a `hydrate` result `{ env: 'client', stats, prefs }` is a subtype of the handler's data. It reduces, the union disappears, and `prefs` is not visible anywhere.

The discriminant has to say which function produced the value: the handler returns `hydrated: false as const`, `hydrate` returns `hydrated: true as const` plus the client-only fields. Write `as const` on both sides. Without it in the handler, `hydrated` widens to `boolean` and the `hydrate` result is a subtype again. Without it in `hydrate`, `true` widens to `boolean` and the `hydrated: false` branch no longer rules out the `hydrate` result.

```tsx
// src/routes/dashboard.tsx
export const Route = createFileRoute('/dashboard')({
  ssr: 'data-only', // the server renders one branch, the first client render the other
  loader: {
    handler: async () => ({
      hydrated: false as const,
      stats: await fetchStats(),
    }),
    dehydrate: ({ data }) => ({ stats: data.stats }),
    hydrate: async ({ data }) => ({
      hydrated: true as const,
      stats: data.stats,
      prefs: await readPrefs(),
    }),
  },
})
// Route.useLoaderData():
//   | { hydrated: false; stats: Stats }
//   | { hydrated: true; stats: Stats; prefs: Prefs }
//
// In the component, `if (data.hydrated)` narrows to the second member and
// `data.prefs` is a `Prefs`; in the other branch `prefs` does not exist.
```

On a client navigation the handler runs in the browser, so the component sees the `hydrated: false` branch. That is the truth: `hydrate` did not run and `prefs` was not read. This form fits data that only exists after hydration. When the field should also be there after a client navigation, declare it in the handler as in [Combine server data with client-only data](#combine-server-data-with-client-only-data): a client-only field in a same-shape result is declared optional (`undefined`) in the handler and must itself be serializable, because the handler's result is what `dehydrate: true` checks.

## Async `dehydrate` and `hydrate`

Both halves may be async. The server awaits `dehydrate` before the match is marked successful, and the client awaits `hydrate` during hydration; the awaited value is used everywhere, including in the inferred types.

```tsx
loader: {
  handler: () => fetchDocument(),
  dehydrate: async ({ data }) => ({ id: data.id, body: await compress(data.body) }),
  hydrate: async ({ data }) => ({ id: data.id, body: await decompress(data.body) }),
}
```

## Errors thrown by `dehydrate` or `hydrate`

Use `dehydrate` and `hydrate` to transform successful data. Make routing decisions in `handler`: return or throw `redirect()`, or throw `notFound()`. A failed transform follows the error and recovery rules below; it does not redirect directly.

- A throw inside `dehydrate` is handled like a throw inside the handler: the match becomes an error match with its `errorComponent` and `onError`. A `redirect()` or `notFound()` thrown from `dehydrate` is such an ordinary error.
- A throw inside `hydrate`, whatever is thrown, is a failure during hydration like any other (next section): the client load that follows hydration runs the lifecycle's `handler` in the browser. `hydrate` itself never shows an `errorComponent` or calls `onError`. If the handler succeeds, the page continues with its result; if it fails, the client load handles the error, redirect or not-found as on a client navigation.
- A `redirect()` returned from `hydrate` is such a failure too, as when the lifecycle’s `handler` returns one.

## When a lifecycle fails during hydration

During hydration the client runs some lifecycles itself: every lifecycle the server ran without sending its result, and every `hydrate`. On a route the server rendered as an error or a not-found, it runs only `context` and `hydrate` (see the end of this section). A run fails when the handler throws an error, returns or throws `redirect()`, or throws `notFound()`, or when `hydrate` throws.

Hydration does not handle the failure itself and does not call `onError` for it. It shows that route as pending and hands it, together with the routes below it, to the normal client load that follows hydration. That load runs the route again like a client navigation. If the run succeeds, the route renders with its result; otherwise the load renders the `errorComponent` and calls `onError`, follows the redirect, or renders the `notFoundComponent`. On a route with `ssr: true` the route's server HTML is replaced by its pending state in the meantime, which can show up as a [hydration mismatch](./hydration-errors.md).

A lifecycle that the client re-runs during hydration and that fails there therefore runs twice on the client, once during hydration and once in the client load, so its side effects (a request, a log entry, an analytics event) happen twice; this only happens when a run fails.

Some lifecycles that succeeded during hydration also run again in the client load, so their side effects happen twice as well:

- `beforeLoad` with `dehydrate: false` on the failing route and the routes below it, because every load runs `beforeLoad`.
- `loader` with `dehydrate: false` on the routes below the failing route. Loader results the browser computed below a failed route are not kept, because they may have read the failed route through `parentMatchPromise`. The client load can reuse loader data the server sent for those routes.
- A `context` that is not sent (the default), when the failing route is the root route. The client load then starts from scratch. Below the root route, a `context` that finished during hydration is kept.

None of this applies to a route that the server already rendered as an error or a not-found, or to the root route when it shows the not-found page. Such a route keeps the server's result. During hydration the browser runs only its `context` and the `hydrate` of each result that was sent. A `beforeLoad` or `loader` whose result was not sent does not run there, so that result is missing on that route in the browser. A failure there during hydration, a throwing `hydrate` included, does not make anything run again: the route keeps the server's state, and the result that failed is missing in the browser too. A layout below the root that shows the not-found page for an unknown URL in its `Outlet` hydrates like any other route.

The root layout renders around the not-found page. If it shows a `beforeLoad` or `loader` result, keep that result sent (the default). With `dehydrate: false` the browser renders the root layout without it on every unknown URL, which can show up as a [hydration mismatch](./hydration-errors.md).

## What the build removes

Each bundle only keeps the half it runs. The Start build removes these keys from route options:

| Bundle | Removed keys                                                                    |
| ------ | ------------------------------------------------------------------------------- |
| client | `context.dehydrate`, `beforeLoad.dehydrate`, `loader.dehydrate`                 |
| server | `context.hydrate`, `beforeLoad.hydrate`, `loader.hydrate`, `context.revalidate` |

Source:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  context: {
    handler: async ({ params, context }) => ({
      postId: params.postId,
      session: await getSession(context),
    }),
    dehydrate: ({ data }) => ({
      postId: data.postId,
      userId: data.session.userId,
    }),
    hydrate: ({ data, context }) => ({
      postId: data.postId,
      session: context.sessions.get(data.userId)!,
    }),
    revalidate: true,
  },
})
```

Client bundle: `context: { handler, hydrate, revalidate: true }`. Server bundle: `context: { handler, dehydrate }`.

Removing these properties reduces bundle size without changing lifecycle behavior. Imports, functions, and variables used only by a removed property are removed too, including from split route chunks. Class declarations remain and keep their imports. Use [import protection](./import-protection.md) to protect server-only code; removing lifecycle properties is not a security boundary.

Scope: the compiler processes the options object passed to `createFileRoute`, `createRootRoute` and `createRootRouteWithContext`, written inline or held in a variable of the same file, also behind `satisfies` or `as`. Lifecycle properties are removed only from inline objects, such as `loader: { handler, dehydrate, hydrate }`, including supported TypeScript wrappers. Lifecycle objects stored in variables (`loader: postsLoader`), imported from another module, or returned by a helper keep their properties. Spread members and computed keys are not processed, and code-based `createRoute` calls are not visited. See [Removing route options from a build](/router/latest/docs/framework/react/guide/automatic-code-splitting#removing-route-options-from-a-build-deletenodes) for the full list.

## Rules

The object form follows a few rules. TypeScript enforces most of them; the key order and the annotation rule are checked by lint rules.

- The object form requires `handler`.
- `revalidate` exists on `context` only; `staleReloadMode` on `loader` only.
- A `dehydrate` function requires `hydrate`.
- `hydrate` requires `dehydrate`: with a `dehydrate` function, `data` is the wire value; with `dehydrate: true`, `data` is the handler's full value. Without a `dehydrate` key, or with `dehydrate: false`, `hydrate` is rejected.
- Write the keys in this order: `handler`, `dehydrate`, `hydrate`, then `revalidate` or `staleReloadMode`. The parameters of `dehydrate`, `hydrate` and `revalidate` are inferred from the keys before them. The [`create-route-property-order`](/router/latest/docs/eslint/create-route-property-order) lint rule checks the order and can fix it. TypeScript does not check the order. A wrong order shows up as a type error only when it breaks that inference, and the error rarely says so:
  - A `handler` that reads its options (`({ params }) => ...`), written after a function that reads `data` or `prev`, gets an error that says to write `handler` first. This is the error when the object has a `dehydrate` function or `dehydrate: false`.
  - With `dehydrate: true`, or without a `dehydrate` key, the same `handler` gets an error that its result is not assignable to `never`. On a route with `ssr: false` the result is not checked for serializability, so this error changes: next to `dehydrate: true` the order compiles, and without a `dehydrate` key the error says that `dehydrate` is missing.
  - A `hydrate` that reads `data`, written before a `dehydrate` function, gets an error that the `dehydrate` function is not assignable to `true`. Move `dehydrate` above `hydrate`. Do not switch to `dehydrate: true`, which sends the handler's full result.
  - A `revalidate` that reads `prev`, written before a `hydrate` that returns a different shape, gets an error about the type `hydrate` returns.

  Other wrong orders compile. When one of these errors appears, fix the key order. Do not add `dehydrate: true` or switch to it to make the error go away.

- Never annotate the parameters of `dehydrate`, `hydrate` or `revalidate`. They are inferred; an annotation is trusted instead of checked and can hide a mismatch between what the server sends and what the client expects. The [`no-lifecycle-codec-param-annotations`](/router/latest/docs/eslint/no-lifecycle-codec-param-annotations) lint rule reports annotations on functions written inline. Next to `dehydrate: true`, a `hydrate` passed by reference or typed through `satisfies` or `as` is checked by neither TypeScript nor the rule: the type it declares for `data` is taken as is. Write `hydrate` inline when `dehydrate` is `true`.
- `dehydrate` and `hydrate` may be async. They only transform a value: a `redirect()` or `notFound()` thrown from `dehydrate` is an ordinary error, and any throw from `hydrate` makes the client load run `handler` instead.
- `hydrate` may return a different shape than `handler`. The data type is then the union of both; a result assignable to the handler's data reduces to it. Narrow on a literal written with `as const` on both sides that says which function produced the value (`hydrated: false` in `handler`, `hydrated: true` in `hydrate`), not on server versus client.
- A transported result must be serializable. A custom `dehydrate` moves that check to its return value.

If your problem is a type that does not serialize, such as a class instance, you do not need `dehydrate` and `hydrate`. Register a [serialization adapter](./serialization-adapters.md) once and return the value as is.
