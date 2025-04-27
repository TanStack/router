---
title: Quick Start
---

If you're feeling impatient and prefer to skip all of our wonderful documentation, here is the bare minimum to get going with TanStack Router using both file-based route generation and code-based route configuration:

## Using File-Based Route Generation

File based route generation (through Vite, and other supported bundlers) is the recommended way to use TanStack Router as it provides the best experience, performance, and ergonomics for the least amount of effort.

### Scaffolding Your First TanStack Router Project

```sh
npx create-tsrouter-app@latest my-app --framework solid --template file-router
```

See [create-tsrouter-app](https://github.com/TanStack/create-tsrouter-app/tree/main/cli/create-tsrouter-app) for more options.

### Manual Setup

Alternatively, you can manually setup the project using the following steps:

#### Install TanStack Router, Vite Plugin, and the Router Devtools

```sh
npm install @tanstack/solid-router @tanstack/solid-router-devtools
npm install -D @tanstack/router-plugin
# or
pnpm add @tanstack/solid-router @tanstack/solid-router-devtools
pnpm add -D @tanstack/router-plugin
# or
yarn add @tanstack/solid-router @tanstack/solid-router-devtools
yarn add -D @tanstack/router-plugin
# or
bun add @tanstack/solid-router @tanstack/solid-router-devtools
bun add -D @tanstack/router-plugin
# or
deno add npm:@tanstack/solid-router npm:@tanstack/router-plugin npm:@tanstack/solid-router-devtools
```

#### Configure the Vite Plugin

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'solid', autoCodeSplitting: true }),
    solid(),
    // ...,
  ],
})
```

> [!TIP]
> If you are not using Vite, or any of the supported bundlers, you can check out the [TanStack Router CLI](./routing/installation-with-router-cli.md) guide for more info.

Create the following files:

- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/routes/about.tsx`
- `src/main.tsx`

#### `src/routes/__root.tsx`

```tsx
import { createRootRoute, Link, Outlet } from '@tanstack/solid-router'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <div class="p-2 flex gap-2">
        <Link to="/" class="[&.active]:font-bold">
          Home
        </Link>{' '}
        <Link to="/about" class="[&.active]:font-bold">
          About
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})
```

#### `src/routes/index.tsx`

```tsx
import { createLazyFileRoute } from '@tanstack/solid-router'

export const Route = createLazyFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div class="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}
```

#### `src/routes/about.tsx`

```tsx
import { createLazyFileRoute } from '@tanstack/solid-router'

export const Route = createLazyFileRoute('/about')({
  component: About,
})

function About() {
  return <div class="p-2">Hello from About!</div>
}
```

#### `src/main.tsx`

Regardless of whether you are using the `@tanstack/router-plugin` package and running the `npm run dev`/`npm run build` scripts, or manually running the `tsr watch`/`tsr generate` commands from your package scripts, the route tree file will be generated at `src/routeTree.gen.ts`.

Import the generated route tree and create a new router instance:

```tsx
import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  render(() => <RouterProvider router={router} />, rootElement)
}
```

If you are working with this pattern you should change the `id` of the root `<div>` on your `index.html` file to `<div id='root'></div>`

## Using Code-Based Route Configuration

> [!IMPORTANT]
> The following example shows how to configure routes using code, and for simplicity's sake is in a single file for this demo. While code-based generation allows you to declare many routes and even the router instance in a single file, we recommend splitting your routes into separate files for better organization and performance as your application grows.

```tsx
import { render } from 'solid-js/web'
import {
  Outlet,
  RouterProvider,
  Link,
  createRouter,
  createRoute,
  createRootRoute,
} from '@tanstack/solid-router'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <div class="p-2 flex gap-2">
        <Link to="/" class="[&.active]:font-bold">
          Home
        </Link>{' '}
        <Link to="/about" class="[&.active]:font-bold">
          About
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Index() {
    return (
      <div class="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: function About() {
    return <div class="p-2">Hello from About!</div>
  },
})

const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

const router = createRouter({ routeTree })

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  render(() => <RouterProvider router={router} />, rootElement)
}
```

If you glossed over these examples or didn't understand something, we don't blame you, because there's so much more to learn to really take advantage of TanStack Router! Let's move on.
