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

- `StartServer` from `@tanstack/react-router-server`
  - e.g. `<StartServer router={router} />`
  - Rendering this component in your server entry will render your application and also automatically handle application-level hydration/dehydration and implement the `Wrap` component option on `Router`
- `StartClient` from `@tanstack/react-router-server/client`
  - e.g. `<StartClient router={router} />`
  - Rendering this component in your client entry will render your application and also automatically implement the `Wrap` component option on `Router`
- `DehydrateRouter` from `@tanstack/react-router-server/client`
  - e.g. `<DehydrateRouter />`
  - Render this component **inside your application** to embed the router's dehydrated data into the application.

### Router Creation

Since your router will exist both on the server and the client, it's important that you create your router in a way that is consistent between both of these environments. The easiest way to do this is to expose a `createRouter` function in a shared file that can be imported and called by both your server and client entry files.

- `src/router.tsx`

```tsx
import * as React from 'react'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from 'routeTree.gen'

export function createRouter() {
  return createRouter({ routeTree })
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

For more information on how to utilize data loading and data streaming, see the [Data Loading](../data-loading) and [Data Streaming](../data-streaming) guides.

### Dehydrating the Router

**SSR would be a waste of time without access to all of the precious data you just fetched on the server!** One of the last steps to prepping your app for SSR is to dehydrate your application data into the markup on the server.

To do this, render the `<DehydrateRouter />` component somewhere inside your Root component. `<DehydrateRouter />` will render a `<script>` tag that contains the JSON of the router's dehydrated state that can then be rehydrated on the client.

```tsx
// src/root.tsx

import * as React from 'react'
import { DehydrateRouter } from '@tanstack/react-router-server/client'

export function Root() {
  return (
    <html>
      <body>
        <DehydrateRouter />
      </body>
    </html>
  )
}
```

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
import { StartServer } from '@tanstack/react-router-server'
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

import { StartClient } from '@tanstack/react-router-server/client'
import { createRouter } from './router'

const router = createRouter()

ReactDOM.hydrateRoot(document, <StartClient router={router} />)
```

With this setup, your application will be rendered on the server and then hydrated on the client!

## Streaming SSR

Streaming SSR is the most modern flavor of SSR and is the process of continuously and incrementally sending HTML markup to the client as it is rendered on the server. This is slightly different from traditional SSR in concept because beyond being able to dehydrate and rehydrate a critical first paint, markup and data with less priority or slower response times can be streamed to the client after the initial render, but in the same request.

This pattern can be useful for pages that have slow or high-latency data fetching requirements. For example, if you have a page that needs to fetch data from a third-party API, you can stream the critical initial markup and data to the client and then stream the less-critical third-party data to the client as it is resolved.

To enable this streaming pattern with TanStack Router, you will need to use React's `renderToPipeableStream` function to render your application to a readable stream. This function returns a stream that can be piped to the response. Here's the utility information:

- `transformStreamWithRouter` from `@tanstack/react-router-server`
  - e.g. `transformStreamWithRouter(router)`
  - This function returns a stream Transform instance that can be used to transform a stream of HTML markup from React DOM's `renderToPipeableStream` function as it is piped to the response.
  - This transform automatically and incrementally embeds fine-grained HTML injections and dehydrated data chunks into the stream.

### Transforming the Stream

Let's implement the `transformStreamWithRouter` function from `@tanstack/react-router-server` to transform the stream of HTML markup from React DOM's `renderToPipeableStream` function as it is piped to the response.

```tsx
// Render the app to a readable stream
let stream!: PipeableStream

await new Promise<void>((resolve) => {
  stream = ReactDOMServer.renderToPipeableStream(
    <StartServer router={router} />,
    {
      [callbackName]: () => {
        res.statusCode = didError ? 500 : 200
        res.setHeader('Content-Type', 'text/html')
        resolve()
      },
      onError: (err) => {
        didError = true
        console.log(err)
      },
    },
  )
})

if (router.hasNotFoundMatch() && res.statusCode !== 500) {
  res.statusCode = 404
}

// Add our Router transform to the stream
const transforms = [transformStreamWithRouter(router)]

// Pipe the stream through our transforms
const transformedStream = transforms.reduce(
  (stream, transform) => stream.pipe(transform as any),
  stream,
)

// Pipe the transformed stream to the response
transformedStream.pipe(res)
```

With `renderToPipeableStream` and `transformStreamWithRouter`, TanStack Router is now configured to stream data to the client as it is rendered on the server!

## Data Transformers

When using SSR, data passed between the server and the client must be serialized before it is sent accross network-boundaries. By default, TanStack Router will serialize data using the default `JSON.parse` and `JSON.stringify` implementations. This, however, can lead to incorrect type-definitions when using objects such as `Date`/`Map`/`Set` etc. The Data Transformer API allows the usage of a custom serializer that can allow us to transparently use these data types when communicating across the network.

The following example shows usage with [SuperJSON](https://github.com/blitz-js/superjson), however, anything that implements [`Router Transformer`](../../api/router/RouterOptionsType#transformer-property) can be used.

```tsx
import { SuperJSON } from 'superjson'

const router = createRouter({
  transformer: SuperJSON,
})
```

Just like that, TanStack Router will now appropriately use SuperJSON to serialize data across the network.
