# TanStack Router for Octane

Official TanStack Router bindings for the
[Octane](https://github.com/octanejs/octane) renderer.

```sh
pnpm add @tanstack/octane-router octane
```

The package re-exports `@tanstack/router-core` and supplies the Octane-specific
components, hooks, hydration, document primitives, and streaming SSR handlers.
It is published as raw source so the Octane Vite compiler can produce the
correct client or server output for each build environment.

## Router

```ts
import { createRoot } from 'octane'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/octane-router'

function RootLayout() @{
  <nav>
    <Link to="/">Home</Link>
    <Link to="/about">About</Link>
  </nav>
  <Outlet />
}

function Home() @{
  <h1>Home</h1>
}

const rootRoute = createRootRoute({ component: RootLayout })
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
})

createRoot(document.getElementById('__app')!).render(RouterProvider, { router })
```

Code-based and generated file-based routes share the same typed APIs as the
other TanStack Router bindings, including route-bound hooks, loaders, search
validation, navigation blocking, lazy routes, and link preloading.

## Start and SSR

TanStack Start uses the `@tanstack/octane-router/ssr/server` and
`@tanstack/octane-router/ssr/client` entries. The root route owns the document:

```ts
import {
  Body,
  Head,
  HeadContent,
  Html,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/octane-router'

function RootDocument(props: { children?: unknown }) @{
  <Html lang="en">
    <Head>
      <HeadContent />
    </Head>
    <Body>
      {props.children}
      <Scripts />
    </Body>
  </Html>
}

function RootLayout() @{
  <Outlet />
}

export const Route = createRootRoute({
  shellComponent: RootDocument,
  component: RootLayout,
})
```

`Body` emits the server document's `#__app` hydration boundary. On the client,
`Html` and `Body` flatten into that existing boundary while `Head` portals its
children into `document.head`.

Visit [tanstack.com/router](https://tanstack.com/router) for Router concepts and
API documentation.
