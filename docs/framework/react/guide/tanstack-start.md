---
id: tanstack-start
title: TanStack Start
---

TanStack Start is a full-stack framework for building server-rendered React applications built on top of [TanStack Router](https://tanstack.com/router).

To set up a TanStack Start project, you'll need to:

1. Install the dependencies
2. Add a configuration file
3. Create required templating

Follow this guide to build a basic TanStack Start web application. Together, we will use TanStack Start to:

- Serve an index page...
- Which displays a counter...
- With a button to increment the counter persistently.

[Here is what that will look like](https://stackblitz.com/github/tanstack/router/tree/main/examples/react/start-basic-counter)

Create a new project if you're starting fresh.

```shell
mkdir myApp
cd myApp
npm init -y
```

Create a `tsconfig.json` file with at least the following settings:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "module": "Preserve",
    "target": "ES2022",
    "skipLibCheck": true,
  },
}
```

# Install Dependencies

TanStack Start is powered by [Vinxi](https://vinxi.vercel.app/) and [TanStack Router](https://tanstack.com/router) and requires them as dependencies.

To install them, run:

```shell
npm i @tanstack/start @tanstack/react-router vinxi
```

You'll also need React and the Vite React plugin, so install them too:

```shell
npm i react react-dom @vitejs/plugin-react
```

and some TypeScript:

```shell
npm i -D typescript @types/react @types/react-dom
```

# Update Configuration Files

We'll then update our `package.json` to reference the new Vinxi entry point and set `"type": "module"`:

```jsonc
{
  // ...
  "type": "module",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start",
  },
}
```

To tell Vinxi that it should start TanStack Start's minimal behavior, we need to configure the `app.config.ts` file:

```typescript
// app.config.ts
import { defineConfig } from '@tanstack/start/config'

export default defineConfig({})
```

# Add the Basic Templating

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
from the default [preloading functionality](./preloading.md) to [caching staleness](./data-loading.md).

```tsx
// app/router.tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
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
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/start'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document.getElementById('root')!, <StartClient router={router} />)
```

This enables us to kick off client-side routing once the user's initial server request has fulfilled.

## The Root of Your Application

Finally, we need to create the root of our application. This is the entry point for all other routes. The code in this file will wrap all other routes in the application.

```tsx
// app/routes/__root.tsx
import { createRootRoute } from '@tanstack/react-router'
import { Outlet, ScrollRestoration } from '@tanstack/react-router'
import { Body, Head, Html, Meta, Scripts } from '@tanstack/start'
import * as React from 'react'

export const Route = createRootRoute({
  meta: () => [
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
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Head>
        <Meta />
      </Head>
      <Body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </Body>
    </Html>
  )
}
```

# Writing Your First Route

Now that we have the basic templating setup, we can write our first route. This is done by creating a new file in the `app/routes` directory.

```tsx
// app/routes/index.tsx
import * as fs from 'fs'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

const filePath = 'count.txt'

async function readCount() {
  return parseInt(
    await fs.promises.readFile(filePath, 'utf-8').catch(() => '0'),
  )
}

const getCount = createServerFn('GET', () => {
  return readCount()
})

const updateCount = createServerFn('POST', async (addBy: number) => {
  const count = await readCount()
  await fs.promises.writeFile(filePath, `${count + addBy}`)
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
      onClick={() => {
        updateCount(1).then(() => {
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
