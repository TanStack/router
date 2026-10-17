---
id: ssr
title: SSR
---

> [!WARNING]
> While every effort has been made to separate these APIs from changes to Tanstack Start, there are underlying shared implementations internally. Therefore these can be subject to change and should be regarded as experimental until Start reaches stable status.

Server Side Rendering (SSR) is the process of rendering a component on the server and sending the HTML markup to the client. The client then hydrates the markup into a fully interactive component.

> **TanStack Router is not Next.js, Remix, or React Router DOM.** When generating routes or components, do **not** use `src/pages/`, `app/layout.tsx`, `_app/index.tsx`, `getServerSideProps`, `getStaticProps`, Remix-style `loader`/`action` exports, or imports from `react-router-dom` or `next/`. TanStack uses `src/routes/` with `createFileRoute`, `Link`/`useNavigate`/`redirect` from `@tanstack/react-router`, and (for Start) `createServerFn` from `@tanstack/<framework>-start`. Wrong-framework code typically fails to build or produces conflicting `/` routes at runtime.

There are usually two different flavors of SSR to be considered:

- Non-streaming SSR
  - The entire page is rendered on the server and sent to the client in one single HTML request, including the serialized data the application needs to hydrate on the client.
- Streaming SSR
  - The critical first paint of the page is rendered on the server and sent to the client in one single HTML request, including the serialized data the application needs to hydrate on the client
  - The rest of the page is then streamed to the client as it is rendered on the server.

This guide will explain how to implement both flavors of SSR with TanStack Router!

## Non-Streaming SSR

Non-Streaming server-side rendering is the classic process of rendering the markup for your entire application page on the server and sending the completed HTML markup (and data) to the client. The client then hydrates the markup into a fully interactive application again.

To implement non-streaming SSR with TanStack Router, you will need the following utilities:

<!-- ::start:framework -->

# React

- `RouterClient` from `@tanstack/react-router`
  - e.g. `<RouterClient router={router} />`
  - Rendering this component in your client entry will render your application and also automatically implement the `Wrap` component option on `Router`
- And, either:
  - `defaultRenderHandler` from `@tanstack/react-router`
    - This will render your application in your server entry and also automatically handle application-level hydration/dehydration and also automatically implement the RouterServer component.
      or:
  - `renderRouterToString` from `@tanstack/react-router`
    - This differs from defaultRenderHandler in that it allows you to manually specify the `Wrap` component option on `Router` together with any other providers you may need to wrap it with.
  - `RouterServer` from `@tanstack/react-router`
    - This implements the `Wrap` component option on `Router`

# Solid

- `RouterClient` from `@tanstack/solid-router`
  - e.g. `<RouterClient router={router} />`
  - Rendering this component in your client entry will render your application and also automatically implement the `Wrap` component option on `Router`
- And, either:
  - `defaultRenderHandler` from `@tanstack/solid-router`
    - This will render your application in your server entry and also automatically handle application-level hydration/dehydration and also automatically implement the RouterServer component.
      or:
  - `renderRouterToString` from `@tanstack/solid-router`
    - This differs from defaultRenderHandler in that it allows you to manually specify the `Wrap` component option on `Router` together with any other providers you may need to wrap it with.
  - `RouterServer` from `@tanstack/solid-router`
    - This implements the `Wrap` component option on `Router`

<!-- ::end:framework -->

### Automatic Server History

On the client, Router defaults to using an instance of `createBrowserHistory`. On the server, the Router SSR request handler and TanStack Start automatically create a lightweight history containing only the request URL. This history does not keep a navigation stack or respond to `push`, `replace`, `go`, `back`, or `forward` calls.

Server-side calls to `router.navigate()` and `router.commitLocation()` are also no-ops: their promises resolve without changing the request location or running another load. To redirect a request, use the dedicated [redirect API](../api/router/redirectFunction.md), such as `throw redirect({ to: '/login' })` in `beforeLoad` or a loader.

### Automatic Loader Dehydration/Hydration

Resolved loader data fetched by routes is automatically dehydrated and rehydrated by TanStack Router so long as you complete the standard SSR steps outlined in this guide.

⚠️ If you are using deferred data streaming, you will also need to ensure that you have implemented the [SSR Streaming & Stream Transform](#streaming-ssr) pattern near the end of this guide.

For more information on how to utilize data loading, see the [Data Loading](./data-loading.md) guide.

### What crosses the wire

> **Experimental:** the route `context` option and the `dehydrate` and `hydrate` keys of `beforeLoad` and `loader` are experimental and subject to change.

The server runs each matched route's `context`, `beforeLoad` and `loader`. Which of their results are sent to the client is decided per lifecycle:

| Lifecycle    | Sent to the client by default |
| ------------ | ----------------------------- |
| `context`    | no                            |
| `beforeLoad` | yes                           |
| `loader`     | yes                           |

A result that is sent is restored from the payload during hydration; the lifecycle does not run again on the client. A result that is not sent is recomputed on the client during hydration, in the same order the server used. A recomputed value must come out the same on the client as on the server, otherwise the first client render does not match the HTML.

To change the default, use the object form of the lifecycle. `dehydrate: false` keeps a `beforeLoad` or `loader` result on the server, `dehydrate: true` sends a `context` result, and a `dehydrate` function paired with a `hydrate` function sends a custom wire value that `hydrate` turns back into the value the app uses on the client:

```tsx
export const Route = createFileRoute('/_authed')({
  ssr: 'data-only', // lifecycles run on the server, the component renders on the client only
  context: {
    handler: async ({ context }) => ({
      session: await context.auth.getSession(),
    }),
    dehydrate: true, // context is not sent by default; send this one
  },
  beforeLoad: {
    handler: () => ({ editorSession: createEditorSession() }),
    dehydrate: false, // beforeLoad is sent by default; keep this one on the server
  },
})
```

`createEditorSession()` produces a different value on every run, so the client's recomputed `editorSession` cannot match the server's. `ssr: 'data-only'` (see [Selective SSR](/start/latest/docs/framework/react/guide/selective-ssr)) still runs the lifecycles on the server but renders that route's component on the client only, so the server's value never ends up in the HTML. Without it, `dehydrate: false` is only safe for values that come out the same on both sides.

If a recomputed lifecycle or a `hydrate` fails during hydration, hydration does not handle it. A failure is a thrown error, a thrown `redirect()` or `notFound()`, or a `redirect()` or `notFound()` returned from `beforeLoad` or `loader`. The route is shown as pending and the client load that follows hydration runs it again (after a throwing `hydrate`, it runs `handler`); that run's outcome (data, error, redirect or not-found) is handled as on a client navigation. A recomputed lifecycle that fails therefore runs twice on the client, and so do its side effects. A route the server rendered as an error or not-found, and the root route when it shows the not-found page, follow different rules; see [When a lifecycle fails during hydration](/start/latest/docs/framework/react/guide/ssr-data-transport#when-a-lifecycle-fails-during-hydration).

The full description, including custom `dehydrate`/`hydrate` pairs, async transforms and the rules the type checker enforces, is on the TanStack Start page [SSR Data Transport](/start/latest/docs/framework/react/guide/ssr-data-transport). That page applies to a router-only SSR setup as well, with these differences:

- The type check that a sent result is serializable runs only when the `Register` interface has `ssr: true`. TanStack Start's generated route tree adds it. In a router-only setup, add `ssr: true` next to `router` in your `Register` declaration (see [Router Creation](#router-creation)). Routes with `ssr: false` are not checked. Without the check, some wrong key orders give a different type error than that page lists, or none; [RouteOptions](../api/router/RouteOptionsType.md#lifecycle-object-form) lists both cases.
- Serialization adapters are registered on TanStack Start's `createStart`. `createRouter` has no option for them.
- `createIsomorphicFn`, used in some examples there, is a TanStack Start API.
- Removing `dehydrate` from the client bundle, and `hydrate` and `context.revalidate` from the server bundle, is done by the TanStack Start build. With a plain router setup they stay in both bundles unless you give each production build its own `deleteNodes` list, as shown in [Removing route options from a build](./automatic-code-splitting.md#removing-route-options-from-a-build-deletenodes).

The option reference is in [RouteOptions](../api/router/RouteOptionsType.md#lifecycle-object-form).

### Router Creation

Since your router will exist both on the server and the client, it's important that you create your router in a way that is consistent between both of these environments. The easiest way to do this is to expose a `createRouter` function in a shared file that can be imported and called by both your server and client entry files.

<!-- ::start:framework -->

# React

```tsx title='src/router.tsx'
import { createRouter as createTanstackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanstackRouter({ routeTree })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

# Solid

```tsx title='src/router.tsx'
import { createRouter as createTanstackRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanstackRouter({ routeTree })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

<!-- ::end:framework -->

### Rendering the Application on the Server

Now that you have a router instance that has loaded all the critical data for the current URL, you can render your application on the server:

using `defaultRenderHandler`

<!-- ::start:framework -->

# React

```tsx title="src/entry-server.tsx"
import {
  createRequestHandler,
  defaultRenderHandler,
} from '@tanstack/react-router/ssr/server'
import { createRouter } from './router'

export async function render({ request }: { request: Request }) {
  const handler = createRequestHandler({ request, createRouter })

  return await handler(defaultRenderHandler)
}
```

# Solid

```tsx title="src/entry-server.tsx"
import {
  createRequestHandler,
  defaultRenderHandler,
} from '@tanstack/solid-router/ssr/server'
import { createRouter } from './router'

export async function render({ request }: { request: Request }) {
  const handler = createRequestHandler({ request, createRouter })

  return await handler(defaultRenderHandler)
}
```

<!-- ::end:framework -->

using `renderRouterToString`

React and Solid use their native synchronous string renderers. Suspended components render their Suspense fallback without waiting for the component to resolve. The router still finishes serializing hydration data before returning the response. Use `renderRouterToStream` when you need the server to render suspended content after it resolves.

<!-- ::start:framework -->

# React

```tsx title="src/entry-server.tsx"
import {
  createRequestHandler,
  renderRouterToString,
  RouterServer,
} from '@tanstack/react-router/ssr/server'
import { createRouter } from './router'

export function render({ request }: { request: Request }) {
  const handler = createRequestHandler({ request, createRouter })

  return handler(({ request, responseHeaders, router }) =>
    renderRouterToString({
      request,
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    }),
  )
}
```

# Solid

```tsx title="src/entry-server.tsx"
import {
  createRequestHandler,
  renderRouterToString,
  RouterServer,
} from '@tanstack/react-router/ssr/server'
import { createRouter } from './router'

export function render({ request }: { request: Request }) {
  const handler = createRequestHandler({ request, createRouter })

  return handler(({ request, responseHeaders, router }) =>
    renderRouterToString({
      request,
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    }),
  )
}
```

<!-- ::end:framework -->

NOTE: The createRequestHandler method requires a web api standard Request object, while the handler method will return a web api standard Response promise.

Should you be using a server framework like Express that uses its own Request and Response objects you would need to convert from the one to the other. Please have a look at the examples for how such an implementation might look like.

## Rendering the Application on the Client

On the client, things are much simpler.

- Create your router instance
- Render your application using the `<RouterClient />` component

<!-- ::start:framework -->

# React

```tsx title="src/entry-client.tsx"
import { hydrateRoot } from 'react-dom/client'
import { RouterClient } from '@tanstack/react-router/ssr/client'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document, <RouterClient router={router} />)
```

# Solid

```tsx title="src/entry-client.tsx"
import { hydrate } from 'solid-js/web'
import { RouterClient } from '@tanstack/solid-router/ssr/client'
import { createRouter } from './router'

const router = createRouter()

hydrate(() => <RouterClient router={router} />, document.body)
```

<!-- ::end:framework -->

With this setup, your application will be rendered on the server and then hydrated on the client!

## Streaming SSR

Streaming SSR is the most modern flavor of SSR and is the process of continuously and incrementally sending HTML markup to the client as it is rendered on the server. This is slightly different from traditional SSR in concept because beyond being able to dehydrate and rehydrate a critical first paint, markup and data with lower priority or slower response times can be streamed to the client after the initial render, but in the same request.

This pattern can be useful for pages that have slow or high-latency data fetching requirements. For example, if you have a page that needs to fetch data from a third-party API, you can stream the critical initial markup and data to the client and then stream the less-critical third-party data to the client as it is resolved.

> [!NOTE]
> This streaming pattern is all automatic as long as you are using either `defaultStreamHandler` or `renderRouterToStream`.

> [!IMPORTANT]
> Render [`<Scripts />`](./document-head-management.md#scripts) inside `<body>` of your root route. It emits the route scripts and marks where the router inserts streamed hydration data. Without it the response still completes, but the page cannot hydrate.

using `defaultStreamHandler`

<!-- ::start:framework -->

# React

```tsx title="src/entry-server.tsx"
import {
  createRequestHandler,
  defaultStreamHandler,
} from '@tanstack/react-router/ssr/server'
import { createRouter } from './router'

export async function render({ request }: { request: Request }) {
  const handler = createRequestHandler({ request, createRouter })

  return await handler(defaultStreamHandler)
}
```

# Solid

```tsx title="src/entry-server.tsx"
import {
  createRequestHandler,
  defaultStreamHandler,
} from '@tanstack/solid-router/ssr/server'
import { createRouter } from './router'

export async function render({ request }: { request: Request }) {
  const handler = createRequestHandler({ request, createRouter })

  return await handler(defaultStreamHandler)
}
```

<!-- ::end:framework -->

using `renderRouterToStream`

<!-- ::start:framework -->

# React

```tsx title="src/entry-server.tsx"
import {
  createRequestHandler,
  renderRouterToStream,
  RouterServer,
} from '@tanstack/react-router/ssr/server'
import { createRouter } from './router'

export function render({ request }: { request: Request }) {
  const handler = createRequestHandler({ request, createRouter })

  return handler(({ request, responseHeaders, router }) =>
    renderRouterToStream({
      request,
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    }),
  )
}
```

# Solid

```tsx title="src/entry-server.tsx"
import {
  createRequestHandler,
  renderRouterToStream,
  RouterServer,
} from '@tanstack/solid-router/ssr/server'
import { createRouter } from './router'

export function render({ request }: { request: Request }) {
  const handler = createRequestHandler({ request, createRouter })

  return handler(({ request, responseHeaders, router }) =>
    renderRouterToStream({
      request,
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    }),
  )
}
```

<!-- ::end:framework -->

## Streaming Dehydration/Hydration

Streaming dehydration/hydration is an advanced pattern that goes beyond markup and allows you to dehydrate and stream any supporting data from the server to the client and rehydrate it on arrival. This is useful for applications that may need to further use/manage the underlying data that was used to render the initial markup on the server.

## Data Serialization

When using SSR, data passed between the server and the client must be serialized before it is sent across network-boundaries. TanStack Router handles this serialization using a very lightweight serializer that supports common data types beyond JSON.stringify/JSON.parse.

Out of the box, the following types are supported:

- `undefined`
- `Date`
- `Error`
- `FormData`

If you feel that there are other types that should be supported by default, please open an issue on the TanStack Router repository.

For a type the serializer does not know, such as a class instance, create a serialization adapter with `createSerializationAdapter` (exported from `@tanstack/react-router` and `@tanstack/solid-router`) and register it on TanStack Start's `createStart`; `createRouter` has no option for adapters. The adapter API is described on the Start page [Serialization Adapters](/start/latest/docs/framework/react/guide/serialization-adapters).
