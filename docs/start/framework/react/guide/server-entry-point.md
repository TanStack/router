---
id: server-entry-point
title: Server Entry Point
---

# Server Entry Point

> [!NOTE]
> The server entry point is **optional** out of the box. If not provided, TanStack Start will automatically handle the server entry point for you using the below as a default.

The Server Entry Point supports the universal fetch handler format, commonly used by [Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/) and other WinterCG-compatible runtimes.

To ensure interoperability, the default export must conform to our `ServerEntry` interface:

```ts
export default {
  fetch(req: Request, opts?: RequestOptions): Response | Promise<Response> {
    // ...
  },
}
```

TanStack Start exposes a wrapper to make creation type-safe. This is done in the `src/server.ts` file.

```tsx
// src/server.ts
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry({
  fetch(request, opts) {
    return handler.fetch(request, opts)
  },
})
```

Whether we are statically generating our app or serving it dynamically, the `server.ts` file is the entry point for doing all SSR-related work as well as for handling server routes and server function requests.

## Configuring a Custom Server Entry

By default, Start uses the generated server entry. If you provide your own server entry at a non-standard path, configure it in your bundler plugin. The `server.entry` path is resolved relative to `srcDirectory`, which defaults to `src`.

<!-- ::start:tabs variant="bundler" -->

# Vite

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    tanstackStart({
      server: {
        entry: './server-entry.ts',
      },
    }),
    viteReact(),
  ],
})
```

# Rsbuild

```ts title="rsbuild.config.ts"
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    pluginReact(),
    tanstackStart({
      server: {
        entry: './server-entry.ts',
      },
    }),
  ],
})
```

<!-- ::end:tabs -->

## Custom Server Handlers

You can create custom server handlers to modify how your application is rendered:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const customHandler = defineHandlerCallback((ctx) => {
  // add custom logic here
  return defaultStreamHandler(ctx)
})

const startHandler = createStartHandler(customHandler)

export default createServerEntry({
  fetch(request, opts) {
    return startHandler(request, opts)
  },
})
```

## Error Handling

The generated server entry catches uncaught errors and calls `handleStartError(error)`. Response helpers such as `setResponseStatus`, `setResponseHeader`, and `setCookie` are reconciled onto the error response.

This default behavior means Start owns the uncaught-error boundary. If a loader, server route, or middleware throws after setting response state, Start still returns a valid `Response` with the intended status, headers, and cookies. Server function RPC errors are handled before this top-level boundary so the client protocol response stays intact.

For example, this should return `401`, not a generic `500`:

```tsx
import { createMiddleware } from '@tanstack/react-start'
import {
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'

const authMiddleware = createMiddleware().server(() => {
  setResponseStatus(401, 'Unauthorized')
  setResponseHeader('www-authenticate', 'Bearer')
  throw new Error('Unauthorized')
})
```

This conversion does more than create a plain `new Response(...)`. It preserves response state that Start captured during the request:

- Status and status text from `setResponseStatus`
- Headers from `setResponseHeader` and `setResponseHeaders`
- Cookies from `setCookie`, including multiple `Set-Cookie` headers
- HTTP-style error metadata such as `error.status`, `error.statusText`, `error.headers`, and `error.cause.headers`
- Protocol headers used by server function responses
- Null-body response rules for `HEAD`, `204`, `205`, and `304`

`createStartHandler(...)` rethrows uncaught errors after associating them with the current Start request. If you write a custom server entry and need custom top-level error handling, catch around the returned fetch handler and call `handleStartError(error)` yourself:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
  handleStartError,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const startHandler = createStartHandler(defaultStreamHandler)

export default createServerEntry({
  async fetch(request, opts) {
    try {
      return await startHandler(request, opts)
    } catch (error) {
      // Add logging, reporting, or custom branching here.
      return handleStartError(error)
    }
  },
})
```

Use `handleStartError(error)` when you want custom top-level logic, such as logging or reporting, but still want Start to produce the same error response as the generated server entry.

`handleStartError(error)` is useful because the error is caught outside the active Start handler. It recovers the Start request state associated with non-primitive thrown errors and reconciles that state onto the error response. Primitive throws cannot carry that association.

If you do not want to preserve response helpers that ran before the error, do not call `handleStartError`. Return your own response instead:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const startHandler = createStartHandler(defaultStreamHandler)

export default createServerEntry({
  async fetch(request, opts) {
    try {
      return await startHandler(request, opts)
    } catch (error) {
      console.error(error)
      return new Response('Internal Server Error', { status: 500 })
    }
  },
})
```

Use this pattern when your server entry or deployment platform should fully own the error response and should ignore any status, headers, or cookies set earlier in the Start request.

## Request context

When your server needs to pass additional, typed data into request handlers (for example, authenticated user info, a database connection, or per-request flags), register a request context type via TypeScript module augmentation. The registered context is delivered as the second argument to the server `fetch` handler and is available throughout the server-side middleware chain — including global middleware, request/function middleware, server routes, server functions, and the router itself.

To add types for your request context, augment the `Register` interface from `@tanstack/react-router` with a `server.requestContext` property. The runtime `context` you pass to `handler.fetch` will then match that type. Example:

```tsx
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

type MyRequestContext = {
  hello: string
  foo: number
}

declare module '@tanstack/react-router' {
  interface Register {
    server: {
      requestContext: MyRequestContext
    }
  }
}

export default createServerEntry({
  fetch(request, opts) {
    return handler.fetch(request, {
      ...opts,
      context: { hello: 'world', foo: 123 },
    })
  },
})
```

## Server Configuration

The server entry point is where you can configure server-specific behavior:

- Request/response middleware
- Custom error handling
- Authentication logic
- Database connections
- Logging and monitoring

This flexibility allows you to customize how your TanStack Start application handles server-side rendering while maintaining the framework's conventions.

## Cloudflare Workers

When deploying to Cloudflare Workers, you can extend `server.ts` to handle additional Workers features like queues, scheduled events, and Durable Objects. For a comprehensive guide, see the [Cloudflare Workers documentation for TanStack Start](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/#custom-entrypoints).
