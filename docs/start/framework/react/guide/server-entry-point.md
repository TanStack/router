---
id: server-entry-point
title: Server Entry Point
---

> [!NOTE]
> A custom server entry point is **optional**. Without one, TanStack Start uses its built-in entry, which renders requests and converts uncaught errors into HTTP responses automatically.

The Server Entry Point supports the universal fetch handler format, commonly used by [Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/) and other WinterCG-compatible runtimes.

The default export must provide a `fetch` method that accepts a `Request` and Start's request options, then returns a `Response` or `Promise<Response>`. Use `createServerEntry` to infer these types and keep the complete callback inside the request's context, including custom error handling. For example, this custom `src/server.ts` delegates to the built-in entry:

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

Start automatically detects `src/server.ts`. If that file is absent, it uses the built-in entry. For a custom entry at another path, configure `server.entry` in your bundler plugin. This path is resolved relative to `srcDirectory`, which defaults to `src`.

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

The built-in entry uses `createServerEntry` to catch errors that escape the Start handler and call `handleStartError(error)` inside the active request context. This works without a custom `src/server.ts`. Response helpers such as `setResponseStatus`, `setResponseHeader`, and `setCookie` are applied to the error response.

For an uncaught error, Start returns a generic JSON error body with status `500` unless a response helper or HTTP-style error property supplies another status. A thrown `Response` keeps its body and response metadata, with response helpers applied. Bodies are removed for `HEAD` requests and statuses `204`, `205`, and `304`.

For example, a request to this server route returns `401` with a `WWW-Authenticate` header:

```tsx
// src/routes/api/protected.ts
import { createFileRoute } from '@tanstack/react-router'
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

export const Route = createFileRoute('/api/protected')({
  server: {
    middleware: [authMiddleware],
    handlers: {
      GET: () => new Response('Protected content'),
    },
  },
})
```

Error conversion preserves:

- Status and status text from `setResponseStatus`
- Header operations from the response helpers
- Cookies from `setCookie` and `appendResponseHeader('set-cookie', ...)`, including multiple `Set-Cookie` headers
- HTTP-style error metadata such as `error.status`, `error.statusText`, `error.headers`, and `error.cause.headers`

Start builds a new JSON body for an error, so it never copies headers that describe another body or connection from error metadata: `Content-Length`, `Content-Encoding`, `Content-Range`, `Transfer-Encoding`, `Trailer`, `Connection`, `Keep-Alive`, `Proxy-Connection`, `TE`, and `Upgrade`. When `error.cause` is a `Response`, such as a failed upstream `fetch`, its `Set-Cookie` and `Content-Type` headers are not copied either.

Explicit helper status, status text, and header operations take precedence over error metadata. When neither a helper nor the error supplies a status, Start also logs the error to the server console. The generic JSON body does not expose the error's message or stack.

Errors that Router handles through route error components do not reach this top-level catch. Server function calls and their request middleware use a separate error response path that preserves the RPC serialization protocol. Failures during initialization, before that path is established, fall back to the top-level error response. Errors in a streamed body after the entry has returned its `Response` cannot replace that response's status or headers.

You can use `createServerEntry` with your own `try`/`catch`, including for error reporting with Sentry. Your catch runs first; the wrapper converts only errors that escape your callback. Call the handler returned by `createStartHandler(...)` inside that catch, because it rethrows the original uncaught value:

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
      // Report the original error here, for example to Sentry.
      return handleStartError(error)
    }
  },
})
```

After reporting, choose how to finish the catch:

- Return `handleStartError(error)` to obtain Start's error response explicitly.
- Rethrow `error` to let `createServerEntry` produce that same error response.
- Return your own `Response` to choose its body, status, and headers.

All three options keep `createServerEntry` and its request context. The first two preserve Start's response-helper state.

The wrapper creates the request context before calling your `fetch` callback. The entire callback, including its own catch and code after `await`, runs inside that context. Calling the Start handler with the same `Request` reuses it. `handleStartError` therefore uses the correct request's state even when the thrown value is a primitive, or several requests throw the same `Error` object. Start does not attach request state to errors or remember them for a later catch. A catch outside this wrapper cannot recover a completed request's helper state from the error.

The default export from `@tanstack/react-start/server-entry` is already wrapped. Calling its `fetch` method converts uncaught errors before an outer catch can see them. Use the handler returned by `createStartHandler(...)` inside your callback when you need to catch the original error, as above.

Delegating to the default entry or another wrapped entry with the same `Request` object shares the current request context. A cloned or rewritten `Request` starts a separate context. When passing a new request to a raw `createStartHandler` handler, wrap that invocation with `createServerEntry` too, so errors are converted before leaving the new context:

```tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const rewrittenEntry = createServerEntry({
  fetch: createStartHandler(defaultStreamHandler),
})

export default createServerEntry({
  fetch(request, opts) {
    const url = new URL(request.url)
    if (url.pathname === '/legacy-home') {
      url.pathname = '/'
    }
    return rewrittenEntry.fetch(new Request(url, request), opts)
  },
})
```

The rewritten request owns its response helper state. Catching a raw rewritten handler's error only in the original request's scope would not recover the rewritten request's headers or cookies.

To replace an uncaught error response completely, return your own response from the custom catch:

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

`createServerEntry` returns custom responses as-is, whether they come from a catch or a successful callback. Such responses do not automatically inherit helper state. Likewise, helper writes after `await handler.fetch(...)` are not automatically applied to its returned response; modify that response directly or put the helper writes in Start middleware. Call `handleStartError` in a catch when the error response should inherit helper state.

## Request context

When your server needs to pass additional, typed data into request handlers (for example, authenticated user info, a database connection, or per-request flags), register a request context type via TypeScript module augmentation. Pass the runtime values through the `context` property of the second argument to `handler.fetch`. Type registration does not create these values. The context is available throughout the server-side middleware chain — including global middleware, request/function middleware, server routes, server functions, and the router itself.

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
