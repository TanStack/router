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
  fetch(request) {
    return handler.fetch(request)
  },
})
```

Whether we are statically generating our app or serving it dynamically, the `server.ts` file is the entry point for doing all SSR-related work as well as for handling server routes and server function requests.

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

const fetch = createStartHandler(customHandler)

export default createServerEntry({
  fetch,
})
```

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
  async fetch(request) {
    return handler.fetch(request, { context: { hello: 'world', foo: 123 } })
  },
})
```

## Per-request SSR options

The default server entry handler accepts request options as its second argument.
Use this when you want to keep Start's default handler but override one setting
for a specific request.

```tsx
// src/server.ts
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request, {
      ssr: {
        streaming: {
          render: request.headers.get('x-render-stream') !== 'false',
        },
      },
    })
  },
})
```

`ssr.streaming` in request options is a partial override. For example,
`{ render: false }` disables render streaming for that request.

If you need full handler-level control, create the Start handler yourself:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const handler = createStartHandler({
  handler: defaultStreamHandler,
  ssr: {
    streaming: ({ request }) => {
      if (request.headers.get('user-agent')?.includes('Googlebot')) {
        return { render: false }
      }

      return { render: true }
    },
  },
})

export default createServerEntry({ fetch: handler })
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
