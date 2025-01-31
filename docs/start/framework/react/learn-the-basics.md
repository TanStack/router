---
id: learn-the-basics
title: Learn the Basics
---

This guide will help you learn the basics behind how TanStack Start works, regardless of how you set up your project.

## Dependencies

TanStack Start is (currently\*) powered by [Vinxi](https://vinxi.vercel.app/), [Nitro](https://nitro.unjs.io/) and [TanStack Router](https://tanstack.com/router).

- **TanStack Router**: A router for building web applications.
- **Nitro**: A framework for building server applications.
- **Vinxi**: A server framework for building web applications.

> [!NOTE] Vinxi will be removed before version 1.0.0 is released and TanStack will rely only on Vite and Nitro. The commands and APIs that use Vinxi will likely be replaced with a Vite plugin.

## It all "Starts" with the Router

This is the file that will dictate the behavior of TanStack Router used within Start. Here, you can configure everything
from the default [preloading functionality](../guide/preloading.md) to [caching staleness](../guide/data-loading.md).

```tsx
// app/router.tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

- Notice the `scrollRestoration` property. This is used to restore the scroll position of the page when navigating between routes.

## Route Generation

The `routeTree.gen.ts` file is generated when you run TanStack Start (via `npm run dev` or `npm run start`) for the first time. This file contains the generated route tree and a handful of TS utilities that make TanStack Start fully type-safe.

## The Server Entry Point

Although TanStack Start is designed with client-first APIs, it is by and large, a full-stack framework. This means that all use cases, including both dynamic and static rely on a server or build-time entry to render our application's initial HTML payload.

This is done via the `app/ssr.tsx` file:

```tsx
// app/ssr.tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'

import { createRouter } from './router'

export default createStartHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler)
```

Whether we are statically generating our app or serving it dynamically, the `ssr.tsx` file is the entry point for doing all SSR-related work.

- It's important that a new router is created for each request. This ensures that any data handled by the router is unique to the request.
- The `getRouterManifest` function is used to generate the router manifest, which is used to determine many aspects of asset management and preloading for our application.
- The `defaultStreamHandler` function is used to render our application to a stream, allowing us to take advantage of streaming HTML to the client. (This is the default handler, but you can also use other handlers like `defaultRenderHandler`, or even build your own)

## The Client Entry Point

Getting our html to the client is only half the battle. Once there, we need to hydrate our client-side JavaScript once the route resolves to the client. We do this by hydrating the root of our application with the `StartClient` component:

```tsx
// app/client.tsx
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/start'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document, <StartClient router={router} />)
```

This enables us to kick off client-side routing once the user's initial server request has fulfilled.

## The Root of Your Application

Other than the client entry point, the `__root` route of your application is the entry point for your application. The code in this file will wrap all other routes in the app, including your home page. It behaves like a layout route for your whole application.

Because it is **always rendered**, it is the perfect place to construct your application shell and take care of any global logic.

```tsx
// app/routes/__root.tsx
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Meta, Scripts } from '@tanstack/start'
import type { ReactNode } from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <Meta />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

- This layout may change in the future as we roll out SPA mode, which allows the root route to render the SPA shell without any page-specific content.
- Notice the `Scripts` component. This is used to load all of the client-side JavaScript for the application.

## Routes

Routes are an extensive feature of TanStack Router, and are covered thoroughly in the [Routing Guide](/router/latest/docs/framework/react/guide/file-based-routing). As a summary:

- Routes are defined using the `createFileRoute` function.
- Routes are automatically code-split and lazy-loaded.
- Critical data fetching is coordinated from a Route's loader
- Much more!

```tsx
// app/routes/index.tsx
import * as fs from 'node:fs'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

const filePath = 'count.txt'

async function readCount() {
  return parseInt(
    await fs.promises.readFile(filePath, 'utf-8').catch(() => '0'),
  )
}

const getCount = createServerFn({
  method: 'GET',
}).handler(() => {
  return readCount()
})

const updateCount = createServerFn({ method: 'POST' })
  .validator((d: number) => d)
  .handler(async ({ data }) => {
    const count = await readCount()
    await fs.promises.writeFile(filePath, `${count + data}`)
  })

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => await getCount(),
})

function Home() {
  const router = useRouter()
  const state = Route.useLoaderData()

  return (
    <button
      type="button"
      onClick={() => {
        updateCount({ data: 1 }).then(() => {
          router.invalidate()
        })
      }}
    >
      Add 1 to {state}?
    </button>
  )
}
```

## Navigation

TanStack Start builds 100% on top of TanStack Router, so all of the navigation features of TanStack Router are available to you. In summary:

- Use the `Link` component to navigate to a new route.
- Use the `useNavigate` hook to navigate imperatively.
- Use the `useRouter` hook anywhere in your application to access the router instance and perform invalidations.
- Every router hook that returns state is reactive, meaning it will automatically re-run when the appropriate state changes.

Here's a quick example of how you can use the `Link` component to navigate to a new route:

```tsx
import { Link } from '@tanstack/react-router'

function Home() {
  return <Link to="/about">About</Link>
}
```

For more in-depth information on navigation, check out the [navigation guide](/router/latest/docs/framework/react/guide/navigation).

## Server Functions (RPCs)

You may have noticed the **server function** we created above using `createServerFn`. This is one of TanStack's most powerful features, allowing you to create server-side functions that can be called from both the server during SSR and the client!

Here's a quick overview of how server functions work:

- Server functions are created using the `createServerFn` function.
- They can be called from both the server during SSR and the client.
- They can be used to fetch data from the server, or to perform other server-side actions.

Here's a quick example of how you can use server functions to fetch and return data from the server:

```tsx
import { createServerFn } from '@tanstack/start'
import * as fs from 'node:fs'
import { z } from 'zod'

const getUserById = createServerFn({ method: 'GET' })
  // Always validate data sent to the function, here we use Zod
  .validator(z.string())
  // The handler function is where you perform the server-side logic
  .handler(async ({ data }) => {
    return db.query.users.findFirst({ where: eq(users.id, data) })
  })

// Somewhere else in your application
const user = await getUserById({ data: '1' })
```

To learn more about server functions, check out the [server functions guide](../server-functions).

### Mutations

Server Functions can also be used to perform mutations on the server. This is also done using the same `createServerFn` function, but with the additional requirement that you invalidate any data on the client that was affected by the mutation.

- If you're using TanStack Router only, you can use the `router.invalidate()` method to invalidate all router data and re-fetch it.
- If you're using TanStack Query, you can use the `queryClient.invalidateQueries()` method to invalidate data, among other more specific methods to target specific queries.

Here's a quick example of how you can use server functions to perform a mutation on the server and invalidate the data on the client:

```tsx
import { createServerFn } from '@tanstack/start'

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const updateUser = createServerFn({ method: 'POST' })
  .validator(UserSchema)
  .handler(async ({ data }) => {
    return db
      .update(users)
      .set({ name: data.name })
      .where(eq(users.id, data.id))
  })

// Somewhere else in your application
await updateUser({ data: { id: '1', name: 'John' } })
```

To learn more about mutations, check out the [mutations guide](/router/latest/docs/framework/react/guide/data-mutations).

## Data Loading

Another powerful feature of TanStack Router is data loading. This allows you to fetch data for SSR and preload route data before it is rendered. This is done using the `loader` function of a route.

Here's a quick overview of how data loading works:

- Data loading is done using the `loader` function of a route.
- Data loaders are **isomorphic**, meaning they are executed on both the server and the client.
- For performing server-only logic, call a server function from within the loader.
- Similar to TanStack Query, data loaders are cached on the client and are re-used and even re-fetched in the background when the data is stale.

To learn more about data loading, check out the [data loading guide](/router/latest/docs/framework/react/guide/data-loading).
