---
id: ssr
title: SSR
---

Server Side Rendering (SSR) is the process of rendering a component on the server and sending the HTML markup to the client. The client then hydrates the markup into a fully interactive component.

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

- `StartServer` from `@tanstack/start`
  - e.g. `<StartServer router={router} />`
  - Rendering this component in your server entry will render your application and also automatically handle application-level hydration/dehydration and implement the `Wrap` component option on `Router`
- `StartClient` from `@tanstack/start`
  - e.g. `<StartClient router={router} />`
  - Rendering this component in your client entry will render your application and also automatically implement the `Wrap` component option on `Router`

### Router Creation

Since your router will exist both on the server and the client, it's important that you create your router in a way that is consistent between both of these environments. The easiest way to do this is to expose a `createRouter` function in a shared file that can be imported and called by both your server and client entry files.

- `src/router.tsx`

```tsx
import * as React from 'react'
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

Now you can import this function in both your server and client entry files and create your router.

- `src/entry-server.tsx`

```tsx
import { createRouter } from './router'

export async function render(req, res) {
  const router = createRouter()
}
```

- `src/entry-client.tsx`

```tsx
import { createRouter } from './router'

const router = createRouter()
```

### Server History

On the client, Router defaults to using an instance of `createBrowserHistory`, which is the preferred type of history to use on the client. On the server, however, you will want to use an instance of `createMemoryHistory` instead. This is because `createBrowserHistory` uses the `window` object, which does not exist on the server.

> 🧠 Make sure you initialize your memory history with the server URL that is being rendered.

- `src/entry-server.tsx`

```tsx
const router = createRouter()

const memoryHistory = createMemoryHistory({
  initialEntries: [opts.url],
})
```

After creating the memory history instance, you can update the router to use it.

- `src/entry-server.tsx`

```tsx
router.update({
  history: memoryHistory,
})
```

### Loading Critical Router Data on the Server

In order to render your application on the server, you will need to ensure that the router has loaded any critical data via it's route loaders. To do this, you can `await router.load()` before rendering your application. This will quite literally wait for each of the matching route matches found for this url to run their route's `loader` functions in parallel.

- `src/entry-server.tsx`

```tsx
await router.load()
```

## Automatic Loader Dehydration/Hydration

Resolved loader data fetched by routes is automatically dehydrated and rehydrated by TanStack Router so long as you complete the standard SSR steps outlined in this guide.

⚠️ If you are using deferred data streaming, you will also need to ensure that you have implemented the [SSR Streaming & Stream Transform](#streaming-ssr) pattern near the end of this guide.

For more information on how to utilize data loading and data streaming, see the [Data Loading](./data-loading.md) and [Data Streaming](../data-streaming) guides.

### Rendering the Application on the Server

Now that you have a router instance that has loaded all of the critical data for the current URL, you can render your application on the server:

```tsx
// src/entry-server.tsx

const html = ReactDOMServer.renderToString(<StartServer router={router} />)
```

### Handling Not Found Errors

`router` has a method `hasNotFoundMatch` to check if a not-found error has occurred during the rendering process. Use this method to check if a not-found error has occurred and set the response status code accordingly:

```tsx
// src/entry-server.tsx
if (router.hasNotFoundMatch()) statusCode = 404
```

### All Together Now!

Here is a complete example of a server entry file that uses all of the concepts discussed above.

```tsx
// src/entry-server.tsx
import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/react-router'
import { StartServer } from '@tanstack/start'
import { createRouter } from './router'

export async function render(url, response) {
  const router = createRouter()

  const memoryHistory = createMemoryHistory({
    initialEntries: [url],
  })

  router.update({
    history: memoryHistory,
  })

  await router.load()

  const appHtml = ReactDOMServer.renderToString(<StartServer router={router} />)

  response.statusCode = router.hasNotFoundMatch() ? 404 : 200
  response.setHeader('Content-Type', 'text/html')
  response.end(`<!DOCTYPE html>${appHtml}`)
}
```

## Rendering the Application on the Client

On the client, things are much simpler.

- Create your router instance
- Render your application using the `<StartClient />` component

```tsx
// src/entry-client.tsx

import * as React from 'react'
import ReactDOM from 'react-dom/client'

import { StartClient } from '@tanstack/start'
import { createRouter } from './router'

const router = createRouter()

ReactDOM.hydrateRoot(document, <StartClient router={router} />)
```

With this setup, your application will be rendered on the server and then hydrated on the client!

## Streaming SSR

Streaming SSR is the most modern flavor of SSR and is the process of continuously and incrementally sending HTML markup to the client as it is rendered on the server. This is slightly different from traditional SSR in concept because beyond being able to dehydrate and rehydrate a critical first paint, markup and data with less priority or slower response times can be streamed to the client after the initial render, but in the same request.

This pattern can be useful for pages that have slow or high-latency data fetching requirements. For example, if you have a page that needs to fetch data from a third-party API, you can stream the critical initial markup and data to the client and then stream the less-critical third-party data to the client as it is resolved.

**This streaming pattern is all automatic as long as you are using `renderToPipeableStream`**.

## Streaming Dehydration/Hydration

Streaming dehydration/hydration is an advanced pattern that goes beyond markup and allows you to dehydrate and stream any supporting data from the server to the client and rehydrate it on arrival. This is useful for applications that may need to further use/manage the underlying data that was used to render the initial markup on the server.

## Data Transformers

When using SSR, data passed between the server and the client must be serialized before it is sent across network-boundaries. By default, TanStack Router will serialize data using a very lightweight serializer that supports a few basic types beyond JSON.stringify/JSON.parse.

Out of the box, the following types are supported:

- `Date`
- `undefined`

If you feel that there are other types that should be supported by default, please open an issue on the TanStack Router repository.

If you are using more complex data types like `Map`, `Set`, `BigInt`, etc, you may need to use a custom serializer to ensure that your type-definitions are accurate and your data is correctly serialized and deserialized. This is where the `transformer` option on `createRouter` comes in.

The Data Transformer API allows the usage of a custom serializer that can allow us to transparently use these data types when communicating across the network.

The following example shows usage with [SuperJSON](https://github.com/blitz-js/superjson), however, anything that implements [`Router Transformer`](../api/router/RouterOptionsType.md#transformer-property) can be used.

```tsx
import { SuperJSON } from 'superjson'

const router = createRouter({
  transformer: SuperJSON,
})
```

Just like that, TanStack Router will now appropriately use SuperJSON to serialize data across the network.
