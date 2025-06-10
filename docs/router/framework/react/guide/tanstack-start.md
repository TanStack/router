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

TanStack Start is powered by the following packages and need to be installed as dependencies:

- [@tanstack/start](https://github.com/tanstack/start)
- [@tanstack/react-router](https://tanstack.com/router)
- [Vite](https://vite.dev/)

To install them, run:

```shell
npm i @tanstack/react-start @tanstack/react-router vite
```

You'll also need React and the Vite React plugin, so install their dependencies as well:

```shell
npm i react react-dom @vitejs/plugin-react
```

Please, for you, your fellow developers, and your users' sake, use TypeScript:

```shell
npm i -D typescript @types/react @types/react-dom
```

# Update Configuration Files

We'll then update our `package.json` to use Vite's CLI and set `"type": "module"`:

```jsonc
{
  // ...
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "vite start",
  },
}
```

Then configure TanStack Start's `app.config.ts` file:

```typescript
// app.config.ts
import { defineConfig } from '@tanstack/react-start/config'

export default defineConfig({})
```

# Add the Basic Templating

There are 2 required files for TanStack Start usage:

1. The router configuration
2. The root of your application

Once configuration is done, we'll have a file tree that looks like the following:

```
.
├── app/
│   ├── routes/
│   │   └── `__root.tsx`
│   ├── `router.tsx`
│   ├── `routeTree.gen.ts`
├── `.gitignore`
├── `app.config.ts`
├── `package.json`
└── `tsconfig.json`
```

## The Router Configuration

This is the file that will dictate the behavior of TanStack Router used within Start for both the server and the client. Here, you can configure everything
from the default [preloading functionality](../preloading.md) to [caching staleness](../data-loading.md).

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

## The Root of Your Application

Finally, we need to create the root of our application. This is the entry point for all application routes. The code in this file will wrap all other routes in the application.

```tsx
// app/routes/__root.tsx
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import { Outlet } from '@tanstack/react-router'
import * as React from 'react'

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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

# Writing Your First Route

Now that we have the basic templating setup, we can write our first route. This is done by creating a new file in the `app/routes` directory.

```tsx
// app/routes/index.tsx
import * as fs from 'fs'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

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
