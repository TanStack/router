---
id: build-from-scratch
title: Build a Project from Scratch
---

> [!NOTE]
> If you chose to quick start with an example or cloned project, you can skip this guide and move on to the [Learn the Basics](../learn-the-basics) guide.

_So you want to build a TanStack Start project from scratch?_

This guide will help you build a **very** basic TanStack Start web application. Together, we will use TanStack Start to:

- Serve an index page...
- Which displays a counter...
- With a button to increment the counter persistently.

[Here is what that will look like](https://stackblitz.com/github/tanstack/router/tree/main/examples/react/start-counter)

Let's create a new project directory and initialize it.

```shell
mkdir myApp
cd myApp
npm init -y
```

> [!NOTE] > We use `npm` in all of these examples, but you can use your package manager of choice instead.

## TypeScript Configuration

We highly recommend using TypeScript with TanStack Start. Create a `tsconfig.json` file with at least the following settings:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "target": "ES2022",
    "skipLibCheck": true,
    "strictNullChecks": true,
  },
}
```

## Install Dependencies

TanStack Start is (currently\*) powered by [Vinxi](https://vinxi.vercel.app/) and [TanStack Router](https://tanstack.com/router) and requires them as dependencies.

> [!NOTE] > \*Vinxi will be removed before version 1.0.0 is released and TanStack will rely only on Vite and Nitro. The commands and APIs that use Vinxi will likely be replaced with a Vite plugin or dedicated TanStack Start CLI.

To install them, run:

```shell
npm i @tanstack/start @tanstack/react-router vinxi
```

You'll also need React and the Vite React plugin, so install them too:

```shell
npm i react react-dom && npm i -D @vitejs/plugin-react vite-tsconfig-paths
```

and some TypeScript:

```shell
npm i -D typescript @types/react @types/react-dom
```

## Update Configuration Files

We'll then update our `package.json` to use Vinxi's CLI and set `"type": "module"`:

```json
{
  // ...
  "type": "module",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start"
  }
}
```

Then configure TanStack Start's `app.config.ts` file:

```typescript
// app.config.ts
import { defineConfig } from '@tanstack/start/config'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  vite: {
    plugins: [
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
})
```

## Add the Basic Templating

There are four required files for TanStack Start usage:

1. The router configuration
2. The server entry point
3. The client entry point
4. The root of your application

Once configuration is done, we'll have a file tree that looks like the following:

```
.
├── app/
│   ├── routes/
│   │   └── `__root.tsx`
│   ├── `client.tsx`
│   ├── `router.tsx`
│   ├── `routeTree.gen.ts`
│   └── `ssr.tsx`
├── `.gitignore`
├── `app.config.ts`
├── `package.json`
└── `tsconfig.json`
```

## The Router Configuration

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

> `routeTree.gen.ts` is not a file you're expected to have at this point.
> It will be generated when you run TanStack Start (via `npm run dev` or `npm run start`) for the first time.

## The Server Entry Point

As TanStack Start is an [SSR](https://unicorn-utterances.com/posts/what-is-ssr-and-ssg) framework, we need to pipe this router
information to our server entry point:

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

This allows us to know what routes and loaders we need to execute when the user hits a given route.

## The Client Entry Point

Now we need a way to hydrate our client-side JavaScript once the route resolves to the client. We do this by piping the same
router information to our client entry point:

```tsx
// app/client.tsx
/// <reference types="vinxi/types/client" />
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/start'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document, <StartClient router={router} />)
```

This enables us to kick off client-side routing once the user's initial server request has fulfilled.

## The Root of Your Application

Finally, we need to create the root of our application. This is the entry point for all other routes. The code in this file will wrap all other routes in the application.

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

## Writing Your First Route

Now that we have the basic templating setup, we can write our first route. This is done by creating a new file in the `app/routes` directory.

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

That's it! 🤯 You've now set up a TanStack Start project and written your first route. 🎉

You can now run `npm run dev` to start your server and navigate to `http://localhost:3000` to see your route in action.

You want to deploy your application? Check out the [hosting guide](./hosting.md).
