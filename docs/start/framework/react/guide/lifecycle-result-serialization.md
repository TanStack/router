---
id: lifecycle-result-serialization
title: Route Lifecycle Methods
---

TanStack Start route lifecycle methods let a route derive context, guard access, and load data before rendering. The three route-level lifecycle methods are:

| Method       | Primary job                                          | Result is available as                           |
| ------------ | ---------------------------------------------------- | ------------------------------------------------ |
| `context`    | Add route-specific values to inherited route context | `context` for this route and its children        |
| `beforeLoad` | Guard or prepare a route before loaders run          | `context` for this route and its children        |
| `loader`     | Load route data for rendering                        | loader data, for example `Route.useLoaderData()` |

These methods are isomorphic. They can run on the server during SSR and in the browser during hydration or client-side navigation. Dehydration controls which lifecycle results are sent from the server to the client during SSR hydration. It does not make the lifecycle handler itself server-only.

For inline route definitions, Start strips custom `dehydrate` implementations from the client build while preserving the dehydration marker, and removes custom `hydrate` functions and context `revalidate` callbacks from the server build. That means a custom `dehydrate` function can use server-only APIs, custom `hydrate` and `context.revalidate` callbacks can use browser-only APIs, and both bundles avoid retaining code they cannot execute.

## Execution Order

For a matched route branch, Start loads routes from parent to child.

For each matched route, the serial phase runs:

1. `context`
2. `beforeLoad`

After every eligible matched route finishes that serial phase, loaders run with the accumulated context.

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  context: ({ context }) => {
    return {
      auth: context.auth,
    }
  },
  beforeLoad: ({ context, location }) => {
    if (!context.auth.user) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }

    return {
      canViewDashboard: true,
    }
  },
  loader: async ({ context }) => {
    return context.queryClient.ensureQueryData({
      queryKey: ['dashboard'],
      queryFn: fetchDashboard,
    })
  },
})
```

In this example:

- `context` adds `auth` to the route context.
- `beforeLoad` reads `auth`, redirects if needed, and adds `canViewDashboard`.
- `loader` reads the accumulated context and loads data.
- Child routes can also read `auth` and `canViewDashboard` from context.

## Choose The Right Lifecycle

Use `context` when you want to add values to the route context for this route and its children. Common examples include request/session summaries, tenant IDs, feature flags, dependency handles, and values that `beforeLoad` or `loader` should consume.

Use `beforeLoad` when you need to decide whether the route is allowed to continue. Common examples include auth guards, permission checks, redirects, `notFound()` decisions, and adding guard results to context.

Use `loader` when the route needs data for rendering. Loader data is read with route loader APIs like `Route.useLoaderData()`. Loaders also participate in the router's existing stale-while-revalidate cache behavior.

## Function Form

Function form is best when you only need the lifecycle handler and are happy with the effective dehydration default for that method.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  context: ({ params }) => ({
    postId: params.postId,
  }),
  beforeLoad: ({ context }) => ({
    auditScope: `post:${context.postId}`,
  }),
  loader: async ({ context }) => {
    return fetchPost(context.postId)
  },
})
```

Function form is equivalent to object form without extra lifecycle options. For example, this:

```tsx
loader: async ({ params }) => fetchPost(params.postId)
```

is the simple version of this:

```tsx
loader: {
  handler: async ({ params }) => fetchPost(params.postId),
}
```

Because function form uses the effective dehydration default, a `beforeLoad` or `loader` function result must be serializable by default. Use object form with `dehydrate: false` or a custom `dehydrate` function when the runtime value is not directly serializable.

## Object Form

Use object form when you need lifecycle options such as `revalidate`, `dehydrate`, `hydrate`, or loader `staleReloadMode`.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  context: {
    handler: ({ params }) => ({
      postId: params.postId,
      openedAt: Date.now(),
    }),
    revalidate: true,
    dehydrate: false,
  },
  beforeLoad: {
    handler: ({ context }) => ({
      auditScope: `post:${context.postId}`,
    }),
    dehydrate: true,
  },
  loader: {
    handler: async ({ context }) => fetchPost(context.postId),
    staleReloadMode: 'background',
    dehydrate: true,
  },
})
```

Object form always requires `handler`.

| Option            | Supported on                      | What it does                                                         |
| ----------------- | --------------------------------- | -------------------------------------------------------------------- |
| `handler`         | `context`, `beforeLoad`, `loader` | The lifecycle function itself                                        |
| `revalidate`      | `context` only                    | Lets route context update when the match is invalid or stale         |
| `dehydrate`       | `context`, `beforeLoad`, `loader` | Controls whether and how the result is included in the SSR payload   |
| `hydrate`         | `context`, `beforeLoad`, `loader` | Rebuilds a full lifecycle result from a custom dehydrated wire value |
| `staleReloadMode` | `loader` only                     | Controls loader behavior when stale data reloads                     |

## TanStack Query Options In Context

A common `context` use case is to provide stable TanStack Query options to a route branch.

```tsx
import { queryOptions } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
  })

export const Route = createFileRoute('/posts/$postId')({
  context: ({ params }) => ({
    postQueryOptions: postQueryOptions(params.postId),
  }),
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(context.postQueryOptions)
  },
})
```

This is the default pattern for values like `queryOptions`: the route context value is created once for the match and stays stable for that match. It does not re-run just because the match becomes stale or because `router.invalidate()` is called.

Use object form when part of the route context should be invalidatable. For example, auth status often needs to be refreshed, while query options should stay stable.

```tsx
import { queryOptions } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

const accountQueryOptions = () =>
  queryOptions({
    queryKey: ['account'],
    queryFn: fetchAccount,
  })

export const Route = createFileRoute('/account')({
  staleTime: 30_000,
  context: {
    handler: async () => ({
      accountQueryOptions: accountQueryOptions(),
      authStatus: await getAuthStatus(),
    }),
    revalidate: async ({ prev }) => ({
      accountQueryOptions: prev?.accountQueryOptions ?? accountQueryOptions(),
      authStatus: await getAuthStatus(),
    }),
  },
})
```

The `handler` creates the initial value. The `revalidate` callback receives `prev`, so it can keep stable values, such as `queryOptions`, and only refresh the values that should change.

Use `revalidate: true` when everything in the context can be recomputed by the `handler`.

```tsx
export const Route = createFileRoute('/session')({
  staleTime: 30_000,
  context: {
    handler: async () => ({
      authStatus: await getAuthStatus(),
    }),
    revalidate: true,
  },
})
```

With `revalidate: true`, the route context can re-run when the match becomes stale or when `router.invalidate()` marks it invalid.

## Caching And Revalidation

`loader` keeps the existing router loader cache behavior. Route options such as `staleTime`, `preloadStaleTime`, `gcTime`, `shouldReload`, and loader `staleReloadMode` control when cached loader data is fresh, stale, retained, or reloaded.

`context` has a separate opt-in revalidation API. By default, once a route context value exists for a match, it is kept for that match. To allow context to update when the match is invalidated or stale, add `revalidate` to the `context` object form.

```tsx
export const Route = createFileRoute('/account')({
  staleTime: 30_000,
  context: {
    handler: async ({ context }) => {
      return {
        session: await context.auth.getSession(),
        refreshedAt: Date.now(),
      }
    },
    revalidate: true,
  },
})
```

With `revalidate: true`, Start re-runs the `handler` when context revalidation is needed.

Use a function when revalidation should use the previous value.

```tsx
export const Route = createFileRoute('/account')({
  staleTime: 30_000,
  context: {
    handler: async ({ context }) => {
      return {
        session: await context.auth.getSession(),
        refreshCount: 0,
      }
    },
    revalidate: async ({ context, prev }) => {
      return {
        session: await context.auth.getSession(),
        refreshCount: (prev?.refreshCount ?? 0) + 1,
      }
    },
  },
})
```

The `revalidate` function must return the same data shape as `handler`. It receives `prev`, which is the previous route context result for that lifecycle, or `undefined` if none exists.

`revalidate` is only supported on `context`. `beforeLoad` is a guard phase, and `loader` already has router loader cache and reload controls.

## SSR Hydration And Dehydration

During SSR, Start can include lifecycle results in the dehydrated payload. The client can then reuse those values during hydration instead of immediately re-running that lifecycle.

The built-in defaults are:

| Lifecycle    | Built-in `dehydrate` default |
| ------------ | ---------------------------- |
| `context`    | `false`                      |
| `beforeLoad` | `true`                       |
| `loader`     | `true`                       |

The effective value is resolved in this order:

1. Route method option, such as `loader: { dehydrate: false }`
2. Start/router-level `defaultDehydrate`
3. Built-in default

When a lifecycle result is not dehydrated, the client re-runs that lifecycle during hydration.

Client-side navigation is different from SSR hydration. On client-side navigation, route lifecycle methods run in the browser as needed for that navigation.

## Set Defaults In `start.ts`

Use `defaultDehydrate` in your Start instance to change app-wide defaults.

```tsx
import { createStart } from '@tanstack/react-start'

export const startInstance = createStart(() => ({
  defaultDehydrate: {
    context: false,
    beforeLoad: true,
    loader: true,
  },
}))
```

You can set only the methods you want to override.

```tsx
export const startInstance = createStart(() => ({
  defaultDehydrate: {
    context: true,
  },
}))
```

Per-route settings still win over `defaultDehydrate`.

## `dehydrate: true`

Use `dehydrate: true` when the lifecycle result is serializable, safe to send to the browser, and useful to reuse during hydration.

```tsx
export const Route = createFileRoute('/profile')({
  context: {
    handler: async ({ context }) => ({
      user: await context.auth.getPublicUser(),
    }),
    dehydrate: true,
  },
  loader: {
    handler: async ({ context }) => fetchProfile(context.user.id),
    dehydrate: true,
  },
})
```

TypeScript checks serializability when a lifecycle is effectively dehydrated. That includes `dehydrate: true`, router-level defaults, and built-in defaults.

## `dehydrate: false`

Use `dehydrate: false` when the result is large, not serializable, should not be sent to the browser, or should be recomputed on the client during hydration.

```tsx
export const Route = createFileRoute('/editor')({
  beforeLoad: {
    handler: () => ({
      editorSession: createEditorSession(),
    }),
    dehydrate: false,
  },
})
```

Remember that `dehydrate: false` causes the client to re-run the lifecycle during hydration. Do not put server-only code directly in a lifecycle that can re-run in the browser.

## Custom `dehydrate` And `hydrate`

Use a `dehydrate` function when the runtime value is not the shape you want to send over the wire. The function receives `{ data }`, where `data` is the lifecycle handler result. Its return value is the wire value.

When `dehydrate` is a function, `hydrate` is required. `hydrate` also receives `{ data }`, where `data` is inferred from the return type of `dehydrate`. The `hydrate` return value should reconstruct the full lifecycle result shape that the route expects.

In Start builds, inline custom serializers and revalidators are split by environment:

| Route option                 | Runs in              | Other build output                            |
| ---------------------------- | -------------------- | --------------------------------------------- |
| Custom `dehydrate` function  | Server SSR build     | Replaced with `dehydrate: true` in the client |
| `dehydrate: true` or `false` | Both builds          | Preserved                                     |
| `hydrate`                    | Browser client build | Removed from the server                       |
| `context.revalidate`         | Browser client build | Removed from the server                       |

The lifecycle `handler` remains isomorphic unless another route option prevents it from running in one environment.

```tsx
export const Route = createFileRoute('/report')({
  loader: {
    handler: async () => {
      const report = await fetchReport()

      return {
        report,
        generatedAt: new Date(),
        formatCurrency: (value: number) => `$${value.toFixed(2)}`,
      }
    },
    dehydrate: ({ data }) => ({
      report: data.report,
      generatedAt: data.generatedAt.toISOString(),
    }),
    hydrate: ({ data }) => ({
      report: data.report,
      generatedAt: new Date(data.generatedAt),
      formatCurrency: (value: number) => `$${value.toFixed(2)}`,
    }),
  },
})
```

In this example, the function is not sent over the wire. The wire payload contains only `report` and an ISO date string, and `hydrate` reconstructs the full loader result for the client.

## Partial Dehydration

Partial dehydration is the same pattern applied deliberately: send only the serializable subset that the client needs, then rebuild the full value in `hydrate`.

```tsx
export const Route = createFileRoute('/invoice/$invoiceId')({
  context: {
    handler: ({ params }) => {
      return {
        invoiceId: params.invoiceId,
        loadedAt: new Date(),
        canEdit: (role: string) => role === 'admin',
      }
    },
    dehydrate: ({ data }) => ({
      invoiceId: data.invoiceId,
      loadedAt: data.loadedAt.toISOString(),
    }),
    hydrate: ({ data }) => ({
      invoiceId: data.invoiceId,
      loadedAt: new Date(data.loadedAt),
      canEdit: (role: string) => role === 'admin',
    }),
  },
})
```

Use partial dehydration when:

- The full lifecycle result contains functions, class instances, database handles, caches, or other values that should not be serialized.
- The client only needs part of the value immediately after hydration.
- You want a smaller SSR payload than `dehydrate: true` would produce.
- You can safely reconstruct the client-side runtime shape from a serializable wire value.

Partial dehydration pairs well with TanStack Query options. Send the serializable data that should be reused during hydration, and recreate the query options in `hydrate`.

```tsx
import { queryOptions } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
  })

export const Route = createFileRoute('/posts/$postId')({
  context: {
    handler: async ({ params }) => ({
      postId: params.postId,
      postQueryOptions: postQueryOptions(params.postId),
      authStatus: await getAuthStatus(),
    }),
    revalidate: async ({ params, prev }) => ({
      postId: prev?.postId ?? params.postId,
      postQueryOptions:
        prev?.postQueryOptions ?? postQueryOptions(params.postId),
      authStatus: await getAuthStatus(),
    }),
    dehydrate: ({ data }) => ({
      postId: data.postId,
      authStatus: data.authStatus,
    }),
    hydrate: ({ data }) => ({
      postId: data.postId,
      postQueryOptions: postQueryOptions(data.postId),
      authStatus: data.authStatus,
    }),
  },
})
```

Here, `authStatus` is included in the SSR payload. `postQueryOptions` is not serialized; it is recreated on the client from the serialized `postId`.

## Common Patterns

### Auth Guards

Use `context` to expose auth state, then `beforeLoad` to enforce access.

```tsx
export const Route = createFileRoute('/settings')({
  context: async ({ context }) => ({
    session: await context.auth.getSession(),
  }),
  beforeLoad: ({ context, location }) => {
    if (!context.session.user) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})
```

### Data Prefetching

Use `loader` for data that the route component reads.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params, context }) => {
    return context.queryClient.ensureQueryData({
      queryKey: ['post', params.postId],
      queryFn: () => fetchPost(params.postId),
    })
  },
  component: PostPage,
})

function PostPage() {
  const post = Route.useLoaderData()
  return <article>{post.title}</article>
}
```

### Non-Serializable Context

Use `dehydrate: false` when route context is a runtime-only object.

```tsx
export const Route = createFileRoute('/canvas')({
  context: {
    handler: () => ({
      tools: createDrawingTools(),
    }),
    dehydrate: false,
  },
})
```

### Serializable Guard Results

Use `beforeLoad` with the default dehydration behavior when it returns a small serializable result.

```tsx
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.roles.includes('admin')) {
      throw redirect({ to: '/' })
    }

    return {
      adminAccessChecked: true,
    }
  },
})
```

Because `beforeLoad` is dehydrated by default, this value is reused during hydration.

## Summary

- Use `context` for inherited route values.
- Use `beforeLoad` for guards and route-enter decisions.
- Use `loader` for render data and router-managed data caching.
- Use function form for simple handlers.
- Use object form for `revalidate`, `dehydrate`, `hydrate`, and loader `staleReloadMode`.
- Use `dehydrate: true` for small, safe, serializable values.
- Use `dehydrate: false` for values that should not be in the SSR payload.
- Use custom `dehydrate` / `hydrate` for wire-safe transformations and partial dehydration.
