---
id: ssr-and-streaming
title: SSR & Streaming
---

Server Side Rendering (SSR) and Streaming are two different concepts that are often confused. This guide will explain the difference between the two and how to use one or both of them.

## Server Side Rendering

Server Side Rendering (SSR) is the process of rendering a component on the server and sending the HTML markup to the client. The client then hydrates the markup into a fully interactive component.

In traditional SSR configurations, the entire page is rendered on the server and sent to the client in one single HTML request, including the serialized data the application needs to hydrate on the client.

To make this process simple, use the following utilities:

- The `@tanstack/react-start/server` package
  - `StartServer`
    - e.g. `<StartServer router={router} />`
    - Rendering this component in your server entry will render your application and also automatically handle application-level hydration/dehydration and implement the `Wrap` component option on `Router`
- The `@tanstack/react-start/client` package

  - `StartClient`
    - e.g. `<StartClient router={router} />`
    - Rendering this component in your client entry will render your application and also automatically implement the `Wrap` component option on `Router`
  - `DehydrateRouter`
    - e.g. `<DehydrateRouter />`
    - Render this component **inside your application** to embed the router's dehydrated data into the application.

### Router Creation

Since your router will exist both on the server and the client, it's important that you create your router in a way that is consistent between both of these environments. The easiest way to do this is to expose a `createRouter` function in a shared file that can be imported and called by both your server and client entry files.

```js
import * as React from 'react'
import { Router } from '@tanstack/router'
import { rootRoute } from './routes/root'
import { indexRoute } from './routes/index'
import { postsRoute } from './routes/posts'
import { postsIndexRoute } from './routes/posts/index'
import { postIdRoute } from './routes/posts/$postId'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute]),
])

export function createRouter() {
  return new Router({ routeTree,})
}

declare module '@tanstack/router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

Now you can import this function in both your server and client entry files and create your router.

```js
// src/entry-server.tsx

import { createRouter } from './router'

export async function render(req, res) {
  const router = createRouter()
}
```

```js
// src/entry-client.tsx

import { createRouter } from './router'

const router = createRouter()
```

### Server History

On the client, Router defaults to using an instance of `createBrowserHistory`, which is the preferred type of history to use on the client. On the server, however, you will want to use an instance of `createMemoryHistory` instead. This is because `createBrowserHistory` uses the `window` object, which does not exist on the server.

> 🧠 Make sure you initialize your memory history with the server URL that is being rendered.

```tsx
// src/entry-server.tsx

const router = createRouter()

const memoryHistory = createMemoryHistory({
  initialEntries: [opts.url],
})
```

After creating the memory history instance, you can update the router to use it.

```tsx
// src/entry-server.tsx

router.update({
  history: memoryHistory,
})
```

### Loading Critical Router Data

In order to render your application on the server, you will need to ensure that the router has loaded any critical data via it's route loaders. To do this, you can `await router.load()` before rendering your application. This will quite literally wait for each of the matching route matches found for this url to run their route's `loader` functions in parallel.

```tsx
// src/entry-server.tsx

await router.load()
```

### Rendering the Application on the Server

Now that you have a router instance that has loaded all of the critical data for the current URL, you can render your application on the server:

```tsx
// src/entry-server.tsx

const html = ReactDOMServer.renderToString(<StartServer router={router} />)
```

### All Together Now!

Here is a complete example of a server entry file that uses all of the concepts discussed above.

```tsx
// src/entry-server.tsx
import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/router'
import { StartServer } from '@tanstack/react-start/server'
import { createRouter } from './router'

export async function render(req, res) {
  const router = createRouter()

  const memoryHistory = createMemoryHistory({
    initialEntries: [req.originalUrl],
  })

  router.update({
    history: memoryHistory,
  })

  await router.load()

  const appHtml = ReactDOMServer.renderToString(<StartServer router={router} />)

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html')
  res.end(`<!DOCTYPE html>${appHtml}`)
}
```

### Rendering the Application on the Client

On the client, you'll want to kick off the router hydration and render your application using the `<StartClient />` component.

```tsx
// src/entry-client.tsx

import * as React from 'react'
import ReactDOM from 'react-dom/client'

import { StartClient } from '@tanstack/react-start/client'
import { createRouter } from './router'

const router = createRouter()
router.hydrate()

ReactDOM.hydrateRoot(document, <StartClient router={router} />)
```

### Application Dehydration/Hydration

TanStack Router is **not a data store**, and because of this it is unaware of any data that your application may need to dehydrate and hydrate between the server and client. It does however provide convenient mechanisms to shuttle your application data between the server and client.

The **`dehydrate` and `hydrate`** options on `Router` are functions that are automatically called on the server and client when the router is ready to dehydrate and hydrate any application data it may need on the client.

The `dehydrate` function can return any serializable JSON data which will get injected into the `DehydrateRouter` component, wherever it's rendered and that same data will be provided back to you in the `hydrate` function on the client.

For example, let's dehydrate and hydrate a `LoaderClient` instance from `@tanstack/react-loaders` so that our loader data we fetched on the server in our router loaders will be available for hydration on the client.

```tsx
// src/router.tsx

export function createRouter() {
  // Make sure you create your loader client or similar data
  // stores inside of your `createRouter` function. This ensures
  // that your data stores are unique to each request and
  // always present on both server and client.
  const loaderClient = createLoaderClient()

  return new Router({
    routeTree,
    // Optionally provide your loaderClient to the router context for
    // convenience (you can provide anything you want to the router
    // context!)
    context: {
      loaderClient,
    },
    // On the server, dehydrate the loader client and return it
    // to the router to get injected into `<DehydrateRouter />`
    dehydrate: () => {
      return {
        loaderClient: loaderClient.dehydrate(),
      }
    },
    // On the client, hydrate the loader client with the data
    // we dehydrated on the server
    hydrate: (dehydrated) => {
      loaderClient.hydrate(dehydrated.loaderClient)
    },
    // Optionally, we can use `Wrap` to wrap our router in the loader client provider
    Wrap: ({ children }) => {
      return (
        <LoaderClientProvider client={loaderClient}>
          {children}
        </LoaderClientProvider>
      )
    },
  })
}
```

### `DehydrateRouter`

To dehydrate your application data, make sure you are rendering the `<DehydrateRouter />` component inside your application. This component will render a `<script>` tag that contains a JSON string of the router's dehydrated data and is required for hydration on the client.

```tsx
// src/root.tsx

import * as React from 'react'
import { DehydrateRouter } from '@tanstack/react-start/client'

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

## Streaming

Streaming is the process of continuously and incrementally sending HTML markup to the client as it is rendered on the server. This is slightly different from traditional SSR in concept because beyond being able to dehydate and rehydrate a critical first paint, markup and data with less priority or slower response times can be streamed to the client after the initial render.

To achieve this streaming pattern with TanStack Router, the following additional utilities are provided:

- The `@tanstack/react-start/server` package
  - `transformStreamWithRouter`
    - e.g. `transformStreamWithRouter(router)`
    - This function returns a stream Transform instance that cam be used to transform a stream of HTML markup from React DOM's `renderToPipeableStream` function as it is piped to the response.
    - This transform automatically and incrementally embeds fine-grained HTML injections and dehydrated data chunks into the stream as.
- The `router.injectHtml` function
  - e.g. `router.injectHtml(() => '<script>console.log("Hello World!")</script>')`
  - This function can be called multiple times during rendering to inject arbitrary HTML markup into the stream.
  - Use it to inject things like `<script>` tags, `<style>` tags, or any other arbitrary HTML markup.
  - 🧠 Make sure you inject your HTML right after a successfully rendered Suspense boundary to ensure that the HTML is injected at the right time.
- The `router.dehydrateData` function
  - e.g. `router.dehydrateData('foo', () => ({ bar: 'baz' }))`
  - This function is a higher-level abstraction around `router.injectHtml`, designed for injecting JSON under a specific key. It can be called multiple times during rendering to inject arbitrary JSON data into the stream under a specific key which can be retrieved later on the client using the `router.hydrateData` function.
  - Use it to inject things like dehydrated data for your application.
  - 🧠 Make sure you inject your data right after a successfully rendered Suspense boundary to ensure that the data is injected in unison with the its corresponding markup that requires it in the stream.
- The `router.hydrateData` function
  - e.g. `router.hydrateData('foo')`
  - This function is a companion to `router.dehydrateData`, designed for retrieving JSON data that was injected into the stream using `router.dehydrateData`.
  - Use it to retrieve things like dehydrated data for your application.
  - 🧠 Make sure you retrieve your data as early as possible on the client to ensure that it is available for hydration when your application renders.

Let's take a look at an example of how to use these utilities to stream a TanStack Router application.

### Transforming the Stream

The first thing we need to do is implement the `transformStreamWithRouter` function from `@tanstack/react-start/server` to transform the stream of HTML markup from React DOM's `renderToPipeableStream` function as it is piped to the response.

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

### Injecting HTML

Now that we have a stream that is being transformed by our router, we can inject arbitrary HTML markup into the stream using the `router.injectHtml` function.

```tsx
function Test() {
  const router = useRouter()
  router.injectHtml(() => '<script>console.log("Hello World!")</script>')
  return null
}
```

### Dehydrating and Hydrating Data

Injecting HTML is pretty low-level, so let's use the `router.dehydrateData` and `router.hydrateData` functions to inject and retrieve some JSON data instead.

```tsx
function Custom() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Inner />
    </Suspense>
  )
}

let testCache: string

function Test() {
  const router = useRouter()

  // Attempt to rehydrate our data on the client
  // On the server, this is a no=op and
  // will return undefined
  const data = router.hydrateData('testCache')

  // Suspend and load our fake data
  if (!testCache) {
    throw new Promise((resolve) => {
      setTimeout(() => {
        testCache = Date.now()
        resolve()
      }, 1000)
    })
  }

  // Dehydrate our data on the server so it can
  // be rehydrated on the client
  router.dehydrateData('testCache', testCache)

  return data
}
```

### Providing Dehydration/Hydration utilities to other tools

The `router.dehydrateData` and `router.hydrateData` functions are designed to be used by other tools to dehydrate and hydrate data. For example, the `@tanstack/react-loaders` package can use generic `dehydrate`/`hydrate` options to dehydrate and hydrate each loader as it is fetch on the server and rendered on the client:

```tsx
// src/router.tsx

export function createRouter() {
  const loaderClient = createLoaderClient()

  const router = new Router({
    ...
  })

  // Provide hydration and dehydration functions to loader instances
  loaderClient.options = {
    ...loaderClient.options,
    hydrateLoaderInstanceFn: (instance) =>
      router.hydrateData(instance.hashedKey),
    dehydrateLoaderInstanceFn: (instance) =>
      router.dehydrateData(instance.hashedKey, () => instance),
  }

  return router
}
```

This allows the loader client to automatically dehydrate and hydrate each loader instance as it is fetched on the server and rendered on the client, leaving your application code free of any boilerplate or knowledge of the hydration/dehydration process:

```tsx
// src/components/MyComponent.tsx

import * as React from 'react'
import { Loader } from '@tanstack/react-loaders'

const testLoader = new Loader({
  key: 'test',
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return 'Hello World!'
  },
})

export function Test() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Inner />
    </Suspense>
  )
}

export function Inner() {
  const instance = useLoaderInstance({ key: 'test' })

  return instance.data
}
```
