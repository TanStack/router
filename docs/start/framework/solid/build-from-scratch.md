---
id: build-from-scratch
title: Build a Project from Scratch
---

> [!NOTE]
> If you chose to quick start with an example or cloned project, you can skip this guide and move on to the [Learn the Basics](../learn-the-basics.md) guide.

_So you want to build a TanStack Start project from scratch?_

This guide will help you build a **very** basic TanStack Start web application. Together, we will use TanStack Start to:

- Serve an index page...
- Which displays a counter...
- With a button to increment the counter persistently.

[Here is what that will look like](https://stackblitz.com/github/tanstack/router/tree/main/examples/solid/start-bare)

Let's create a new project directory and initialize it.

```shell
mkdir myApp
cd myApp
npm init -y
```

> [!NOTE] > We use `npm` in all of these examples, but you can use your package manager of choice instead.

## TypeScript Configuration

We highly recommend using TypeScript with TanStack Start. Create a `tsconfig.json` file with at least the following settings:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "target": "ES2022",
    "skipLibCheck": true,
    "strictNullChecks": true
  }
}
```

> [!NOTE] > Enabling `verbatimModuleSyntax` can result in server bundles leaking into client bundles. It is recommended to keep this option disabled.

## Install Dependencies

TanStack Start is powered by [Vite](https://vite.dev/) and [TanStack Router](https://tanstack.com/router) and requires them as dependencies.

To install them, run:

```shell
npm i @tanstack/solid-start @tanstack/solid-router vite
```

You'll also need Solid:

```shell
npm i solid-js
```

and some TypeScript:

```shell
npm i -D typescript vite-tsconfig-paths
```

## Update Configuration Files

We'll then update our `package.json` to use Vite's CLI and set `"type": "module"`:

```json
{
  // ...
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build"
  }
}
```

Then configure TanStack Start's Vite plugin in `vite.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [tsConfigPaths(), tanstackStart()],
})
```

## Add the Basic Templating

There are 2 required files for TanStack Start usage:

1. The router configuration
2. The root of your application

Once configuration is done, we'll have a file tree that looks like the following:

```
.
├── src/
│   ├── routes/
│   │   └── `__root.tsx`
│   ├── `router.tsx`
│   ├── `routeTree.gen.ts`
├── `.gitignore`
├── `vite.config.ts`
├── `package.json`
└── `tsconfig.json`
```

## The Router Configuration

This is the file that will dictate the behavior of TanStack Router used within Start. Here, you can configure everything
from the default [preloading functionality](/router/latest/docs/framework/solid/guide/preloading) to [caching staleness](/router/latest/docs/framework/solid/guide/data-loading).

> [!NOTE]
> You won't have a `routeTree.gen.ts` file yet. This file will be generated when you run TanStack Start for the first time.

```tsx
// src/router.tsx
import { createRouter as createTanStackRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
  })

  return router
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

> [!NOTE]
> TanStack Start provides **default server and client entry points** to handle requests and client-entry + hydration. You can customize these entry points by adding a `server.ts` and/or `client.tsx` file in the root of your project, but for now, we'll use the defaults.

## The Root of Your Application

Finally, we need to create the root of our application. This is the entry point for all other routes. The code in this file will wrap all other routes in the application.

```tsx
// src/routes/__root.tsx
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/solid-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charset: 'utf-8',
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
  return <Outlet />
}
```

## Writing Your First Route

Now that we have the basic templating setup, we can write our first route. This is done by creating a new file in the `app/routes` directory.

```tsx
// src/routes/index.tsx
import * as fs from 'node:fs'
import { useRouter } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'

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

export const Route = createFileRoute({
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
      Add 1 to {state()}?
    </button>
  )
}
```

That's it! 🤯 You've now set up a TanStack Start project and written your first route. 🎉

You can now run `npm run dev` to start your server and navigate to `http://localhost:3000` to see your route in action.

You want to deploy your application? Check out the [hosting guide](../hosting.md).
