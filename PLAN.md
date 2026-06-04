# Router Lifecycle API Rewrite Status

This branch replaces the old route lifecycle `serialize` / `invalidate` API with a unified lifecycle object API for `context`, `beforeLoad`, and `loader`.

Hard break: there are no compatibility aliases for `serialize` or `invalidate`.

## Current API

Each route lifecycle can use the existing function form or the new object form.

```ts
type LifecycleMethod = 'context' | 'beforeLoad' | 'loader'

type DehydrateOption<TValue, TWire> =
  | undefined
  | false
  | true
  | ((ctx: { data: TValue }) => TWire)

type HydrateOption<TValue, TWire> = (ctx: { data: TWire }) => TValue
```

### Function form

Function form is still the simplest option. It uses the effective dehydration default for that lifecycle method.

```ts
context: (ctx) => value
beforeLoad: (ctx) => value
loader: (ctx) => value
```

### Object form

Object form carries the lifecycle handler plus lifecycle-specific behavior.

```ts
context: {
  handler: (ctx) => value,
  revalidate?: boolean | ((ctx: ContextFnOptions & { prev: value | undefined }) => value),
  dehydrate?: boolean | ((ctx: { data: value }) => wire),
  hydrate?: (ctx: { data: wire }) => value,
}

beforeLoad: {
  handler: (ctx) => value,
  dehydrate?: boolean | ((ctx: { data: value }) => wire),
  hydrate?: (ctx: { data: wire }) => value,
}

loader: {
  handler: (ctx) => value,
  staleReloadMode?: 'background' | 'blocking',
  dehydrate?: boolean | ((ctx: { data: value }) => wire),
  hydrate?: (ctx: { data: wire }) => value,
}
```

Rules:

- If object form is used, `handler` is required.
- `revalidate` is only supported on `context`.
- `revalidate: true` re-runs the `handler` when context is invalid or stale.
- `revalidate: fn` runs that function instead of `handler` when context is invalid or stale and receives `prev`.
- `dehydrate: true` stores the lifecycle result in the SSR payload and requires that result to be serializable.
- `dehydrate: false` omits the lifecycle result from the SSR payload; the client re-runs the lifecycle during hydration.
- `dehydrate: fn` stores the function return value in the SSR payload and requires that wire value to be serializable.
- If `dehydrate` is a function, `hydrate` is required and receives the exact wire type returned by `dehydrate`.
- Both `dehydrate` and `hydrate` use object arguments: `{ data }`.

## Effective Dehydration Defaults

Built-in defaults mirror the old Start behavior:

- `context`: `dehydrate: false`
- `beforeLoad`: `dehydrate: true`
- `loader`: `dehydrate: true`

Priority:

1. Method-level route option
2. Start/router-level `defaultDehydrate`
3. Built-in default

Start config example:

```ts
import { createStart } from '@tanstack/react-start'

export const startInstance = createStart(() => ({
  defaultDehydrate: {
    context: false,
    beforeLoad: true,
    loader: true,
  },
}))
```

## Execution Semantics

On a route load, route matches execute parent-to-child:

1. `context`
2. `beforeLoad`
3. `loader`

`context` and `beforeLoad` run serially for each matched route so child routes can see parent route context. After that serial phase, eligible loaders run with the accumulated context.

During SSR hydration:

1. The server runs the matched route lifecycle methods.
2. The server dehydrates lifecycle results according to the effective `dehydrate` configuration.
3. The client restores dehydrated values.
4. Any lifecycle method that was not dehydrated re-runs on the client during hydration.
5. Route `head`, `scripts`, and rendering continue with the reconstructed match state.

`dehydrate` only controls the SSR-to-client hydration payload. It does not make a lifecycle server-only. Lifecycle methods remain isomorphic and can still run on the client during client-side navigation unless your route/app design avoids that path.

## Implementation Status

Completed:

- Replaced `serialize` / `invalidate` lifecycle options with `handler`, `revalidate`, `dehydrate`, and `hydrate`.
- Added `packages/router-core/src/lifecycle.ts` helpers for function/object lifecycle forms.
- Added built-in lifecycle dehydration defaults and router-level `defaultDehydrate` config.
- Added route-level type inference for function form, object form, `dehydrate`, `hydrate`, and `revalidate`.
- Ensured `hydrate` input is inferred from the return type of `dehydrate`.
- Ensured route-level `dehydrate` return values are checked with `Constrain<..., ValidateSerializableInput<...>>`.
- Ensured `revalidate` returns the same data shape as the `context` handler and receives typed `prev`.
- Added object-form generic propagation through React, Solid, Vue, file routes, and Start server routes.
- Updated SSR server dehydration and client hydration for `{ data }` dehydrate/hydrate arguments.
- Re-runs non-dehydrated lifecycle methods during client hydration.
- Handles `notFound` during client hydration lifecycle re-execution.
- Added unit/type coverage for object forms, serializability, inferred hydrate input, and framework wrappers.
- Reworked `e2e/react-start/router-lifecycle-methods` around `dehydrate`, `hydrate`, `revalidate`, defaults, and partial hydration.

Implementation notes:

- `context` revalidation uses route `staleTime` / `preloadStaleTime` only when the route opts in with `revalidate`.
- Context staleness defaults to `Infinity` when no route/router stale time is configured, unlike loader stale behavior.
- Context revalidation updates `__routeContext` and the merged match context, but does not update `match.updatedAt`; loader completion owns `updatedAt` so context-only revalidation does not accidentally suppress loader stale checks.
- `beforeLoad` and `loader` do not have a `revalidate` option. Loader reloading remains controlled by the existing loader cache/staleness APIs.

## E2E Fixture Coverage

`e2e/react-start/router-lifecycle-methods` currently covers:

- Function-form defaults for `context`, `beforeLoad`, and `loader`.
- Method-level `dehydrate: true` and `dehydrate: false`.
- Router-level `defaultDehydrate` overrides from `src/start.ts`.
- Built-in defaults: context omitted, beforeLoad/loader included.
- Custom `dehydrate` / `hydrate` round trips for `Date` values.
- Partial dehydration that strips non-serializable values and reconstructs `Date`, `RegExp`, and functions on hydrate.
- `context` revalidation with `revalidate: true`.
- Functional `context` revalidation with typed `prev`.
- Stale-time-triggered context revalidation.
- SSR, client navigation, and post-hydration round trips.

## Verification Status

Recently passing before the current documentation work:

- `pnpm build`
- `pnpm test:unit`
- `pnpm test:types`

The full `pnpm test:e2e` sweep was started after Playwright was installed. It exposed unrelated/generated e2e noise and at least one Prisma migration failure in an auth fixture. Per current direction, those failing e2e tests are being ignored for now while lifecycle documentation is added.

## Documentation Status

Completed:

- Replaced the obsolete Start lifecycle serialization guide with a lifecycle methods guide covering `context`, `beforeLoad`, `loader`, execution order, caching, revalidation, defaults, dehydration, hydration, and partial dehydration.
- Kept Solid docs as a framework reference to the React Start guide with package-name replacements.
