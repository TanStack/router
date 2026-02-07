---
id: context-bridge
title: Context Bridge
---

## What is a Context Bridge?

A context bridge transports server-side context values — produced by [middleware](./middleware.md) — to the client via the router's dehydrate/hydrate mechanism. This allows your route loaders and components to access server middleware context on both the server and the client without any manual serialization.

### Why do I need it?

When global request middleware provides context (e.g. user info, feature flags, tenant data), that context is only available on the server during SSR. The context bridge selects specific values from your middleware context, serializes them during dehydration, and restores them on the client during hydration — making them available in the router context everywhere.

## Setup

### 1. Define middleware that provides context

In your `src/start.ts`, define global request middleware that provides context values:

```tsx
// src/start.ts
import { createMiddleware, createStart } from '@tanstack/react-start'

const authMiddleware = createMiddleware().server(async ({ next }) => {
  return next({
    context: {
      userId: 'user-123',
      role: 'admin',
    },
  })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware],
}))
```

### 2. Create the context bridge

Use `createStartContextBridge` to select which middleware context values to bridge to the client. The `select` function receives the accumulated context from all global request middleware.

```tsx
// src/router.tsx
import { createRouter } from '@tanstack/react-router'
import { createStartContextBridge } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    plugins: [
      createStartContextBridge({
        select: (ctx) => ({
          userId: ctx.userId,
          role: ctx.role,
        }),
      }),
    ],
  })
}
```

That's it. The bridged values (`userId`, `role`) are now available in `context` throughout your route tree — on both server and client.

### 3. Use the bridged context in routes

```tsx
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  loader: ({ context }) => {
    // context.userId and context.role are available here
    console.log('User:', context.userId, 'Role:', context.role)
  },
  component: IndexPage,
})

function IndexPage() {
  const { userId, role } = Route.useRouteContext()
  return (
    <div>
      <p>User: {userId}</p>
      <p>Role: {role}</p>
    </div>
  )
}
```

## How it works

The context bridge is a router plugin that hooks into the router's dehydrate/hydrate lifecycle:

1. **On the server**: The plugin reads the global start context (populated by your middleware), runs the `select` function, and merges the selected values into `router.options.context`. It also hooks into `router.options.dehydrate` to serialize those values into the dehydrated payload sent to the client.

2. **On the client**: The plugin hooks into `router.options.hydrate` to read the serialized values from the dehydrated payload and merge them back into `router.options.context`.

This means the bridged values are available synchronously in route loaders and components on both server and client.

## The `select` function

The `select` function controls which middleware context values are bridged to the client. It receives the full accumulated context from all global request middleware.

```tsx
createStartContextBridge({
  select: (ctx) => ({
    // Only bridge what you need on the client
    userId: ctx.userId,
    role: ctx.role,
    // Don't bridge secrets or large objects
  }),
})
```

> [!IMPORTANT]
> The return value of `select` must be serializable. Do not include functions, class instances, or other non-serializable values. The type system will warn you if you try to return non-serializable data.

> [!WARNING]
> Be careful not to bridge sensitive values (API keys, secrets, tokens) since they will be serialized and sent to the client in the HTML payload.

## Combining with other plugins

The context bridge works alongside other router plugins. Each plugin contributes its own keys to the router context, and the type system tracks which keys are provided by plugins so you only need to manually supply the remaining ones.

```tsx
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { createSsrQueryPlugin } from '@tanstack/react-router-ssr-query'
import { createStartContextBridge } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient()

  return createRouter({
    routeTree,
    // Only need to provide keys NOT covered by plugins
    context: {
      appName: 'My App',
    },
    plugins: [
      createStartContextBridge({
        select: (ctx) => ({
          userId: ctx.userId,
          role: ctx.role,
        }),
      }),
      createSsrQueryPlugin({ queryClient }),
    ],
  })
}
```

In this example:

- `startContextBridge` provides `userId` and `role`
- `ssrQueryPlugin` provides `queryClient`
- You only need to manually supply `appName` in `context`

The type system enforces this — if a plugin provides a key, you don't need to include it in `context`, and if you're missing a required key that no plugin provides, you'll get a type error.

## Custom bridge key

If you need multiple context bridges (uncommon), you can provide a custom `key` to avoid collisions in the dehydrated payload:

```tsx
createStartContextBridge({
  key: '__myCustomBridgeKey',
  select: (ctx) => ({ userId: ctx.userId }),
})
```

## Type safety

The context bridge integrates with the router plugin type system:

- The `select` function is typed based on your registered middleware
- The `context` option in `createRouter` becomes optional for keys that plugins provide
- Route loaders and components see the bridged values in their `context` parameter with full type inference
