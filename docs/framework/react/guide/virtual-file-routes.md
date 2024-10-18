---
id: virtual-file-routes
title: Virtual File Routes
---

> We'd like to thank the Remix team for [pioneering the concept of virtual file routes](https://www.youtube.com/watch?v=fjTX8hQTlEc&t=730s). We've taken inspiration from their work and adapted it to work with TanStack Router's existing file-based route-tree generation.

Virtual file routes are a powerful concept that allows you to build a route tree programmatically using code that references real files in your project. This can be useful if:

- You have an existing route organization that you want to keep.
- You want to customize the location of your route files.
- You want to completely override TanStack Router's file-based route generation and build your own convention.

Here's a quick example of using virtual file routes to map a route tree to a set of real files in your project:

```tsx
import {
  rootRoute,
  route,
  index,
  layout,
  physical,
} from '@tanstack/virtual-file-routes'

const virtualRouteConfig = rootRoute('root.tsx', [
  index('index.tsx'),
  layout('layout.tsx', [
    route('/dashboard', 'app/dashboard.tsx', [
      index('app/dashboard-index.tsx'),
      route('/invoices', 'app/dashboard-invoices.tsx', [
        index('app/invoices-index.tsx'),
        route('$id', 'app/invoice-detail.tsx'),
      ]),
    ]),
    physical('/posts', 'posts'),
  ]),
])
```

## Configuration

Virtual file routes can be configured either via:

- The `TanStackRouter` plugin for Vite/Rspack/Webpack
- The `tsr.config.json` file for the TanStack Router CLI

## Configuration via the TanStackRouter Plugin

If you're using the `TanStackRouter` plugin for Vite/Rspack/Webpack, you can configure virtual file routes by passing a `virtualRoutesConfig` option to the plugin:

```tsx
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { rootRoute } from '@tanstack/virtual-file-routes'

const routes = rootRoute('root.tsx', [
  // ... the rest of your virtual route tree
])

export default defineConfig({
  plugins: [TanStackRouterVite({ virtualRouteConfig: routes }), react()],
})
```

## Creating Virtual File Routes

To create virtual file routes, you'll need to import the `@tanstack/virtual-file-routes` package. This package provides a set of functions that allow you to create virtual routes that reference real files in your project. A few utility functions are exported from the package:

- `rootRoute` - Creates a virtual root route.
- `route` - Creates a virtual route.
- `index` - Creates a virtual index route.
- `layout` - Creates a virtual layout route.
- `physical` - Creates a physical virtual route (more on this later).

## Virtual Root Route

The `rootRoute` function is used to create a virtual root route. It takes a file name and an array of children routes. Here's an example of a virtual root route:

```tsx
import { rootRoute } from '@tanstack/virtual-file-routes'

const virtualRouteConfig = rootRoute('root.tsx', [
  // ... children routes
])
```

## Virtual Route

The `route` function is used to create a virtual route. It takes a path, a file name, and an array of children routes. Here's an example of a virtual route:

```tsx
import { route } from '@tanstack/virtual-file-routes'

const virtualRouteConfig = rootRoute('root.tsx', [
  route('/about', 'about.tsx', [
    // ... children routes
  ]),
])
```

You can also define a virtual route without a file name. This allows to set a common path prefix for its children:

```tsx
import { route } from '@tanstack/virtual-file-routes'

const virtualRouteConfig = rootRoute('root.tsx', [
  route('/hello', [
    route('/world', 'world.tsx'), // full path will be "/hello/world"
    route('/universe', 'universe.tsx'), // full path will be "/hello/universe"
  ]),
])
```

## Virtual Index Route

The `index` function is used to create a virtual index route. It takes a file name. Here's an example of a virtual index route:

```tsx
import { index } from '@tanstack/virtual-file-routes'

const virtualRouteConfig = rootRoute('root.tsx', [index('index.tsx')])
```

## Virtual Layout Route

The `layout` function is used to create a virtual layout route. It takes a file name, an array of children routes, and an optional layout ID. Here's an example of a virtual layout route:

```tsx
import { layout } from '@tanstack/virtual-file-routes'

const virtualRouteConfig = rootRoute('root.tsx', [
  layout('layout.tsx', [
    // ... children routes
  ]),
])
```

You can also specify a layout ID to give the layout a unique identifier that is different from the filename:

```tsx
import { layout } from '@tanstack/virtual-file-routes'

const virtualRouteConfig = rootRoute('root.tsx', [
  layout('my-layout-id', 'layout.tsx', [
    // ... children routes
  ]),
])
```

## Physical Virtual Routes

Physical virtual routes are a way to "mount" a directory of good ol' TanStack Router File Based routing convention under a specific URL path. This can be useful if you are using virtual routes to customize a small portion of your route tree high up in the hierarchy, but want to use the standard file-based routing convention for sub-routes and directories.

Consider the following file structure:

```
/routes
├── root.tsx
├── index.tsx
├── layout.tsx
├── app
│   ├── dashboard.tsx
│   ├── dashboard-index.tsx
│   ├── dashboard-invoices.tsx
│   ├── invoices-index.tsx
│   ├── invoice-detail.tsx
└── posts
    ├── index.tsx
    ├── $postId.tsx
    ├── $postId.edit.tsx
    ├── comments/
    │   ├── index.tsx
    │   ├── $commentId.tsx
    └── likes/
        ├── index.tsx
        ├── $likeId.tsx
```

Let's use virtual routes to customize our route tree for everything but `posts`, then use physical virtual routes to mount the `posts` directory under the `/posts` path:

```tsx
const virtualRouteConfig = rootRoute('root.tsx', [
  // Set up your virtual routes as normal
  index('index.tsx'),
  layout('layout.tsx', [
    route('/dashboard', 'app/dashboard.tsx', [
      index('app/dashboard-index.tsx'),
      route('/invoices', 'app/dashboard-invoices.tsx', [
        index('app/invoices-index.tsx'),
        route('$id', 'app/invoice-detail.tsx'),
      ]),
    ]),
    // Mount the `posts` directory under the `/posts` path
    physical('/posts', 'posts'),
  ]),
])
```

## Virtual Routes inside of TanStack Router File Based routing

The previous section showed you how you can use TanStack Router's File Based routing convention inside of a virtual route configuration.
However, the opposite is possible as well.  
You can configure the main part of your app's route tree using TanStack Router's File Based routing convention and opt into virtual route configuration for specific subtrees.

Consider the following file structure:

```
/routes
├── __root.tsx
├── foo
│   ├── bar
│   │   ├── __virtual.ts
│   │   ├── details.tsx
│   │   ├── home.tsx
│   │   └── route.ts
│   └── bar.tsx
└── index.tsx
```

Let's look at the `bar` directory which contains a special file named `__virtual.ts`. This file instructs the generator to switch over to virtual file route configuration for this directory (and its child directories).

`__virtual.ts` configures the virtual routes for that particular subtree of the route tree. It uses the same API as explained above, with the only difference being that no `rootRoute` is defined for that subtree:

```tsx
import {
  defineVirtualSubtreeConfig,
  index,
  route,
} from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig([
  index('home.tsx'),
  route('$id', 'details.tsx'),
])
```

The helper function `defineVirtualSubtreeConfig` is closely modeled after vite's `defineConfig` and allows you to define a subtree configuration via a default export. The default export can either be

- a subtree config object
- a function returning a subtree config object
- an async function returning a subtree config object

## Inception

You can mix and match TanStack Router's File Based routing convention and virtual route configuration however you like.  
Let's go deeper!  
Check out the following example that starts off using File Based routing convention, switches over to virtual route configuration for `/posts`, switches back to File Based routing convention for `/posts/lets-go` only to switch over to virtual route configuration again for `/posts/lets-go/deeper`.

```
├── __root.tsx
├── index.tsx
├── posts
│   ├── __virtual.ts
│   ├── details.tsx
│   ├── home.tsx
│   └── lets-go
│       ├── deeper
│       │   ├── __virtual.ts
│       │   └── home.tsx
│       └── index.tsx
└── posts.tsx
```

## Configuration via the TanStack Router CLI

While much less common, you can also configure virtual file routes via the TanStack Router CLI by adding a `virtualRouteConfig` object to your `tsr.config.json` file and defining your virtual routes and passing the resulting JSON that is generated by calling the actual `rootRoute`/`route`/`index`/etc functions from the `@tanstack/virtual-file-routes` package:

```json
// tsr.config.json
{
  "virtualRouteConfig": {
    "type": "root",
    "file": "root.tsx",
    "children": [
      {
        "type": "index",
        "file": "home.tsx"
      },
      {
        "type": "route",
        "file": "posts/posts.tsx",
        "path": "/posts",
        "children": [
          {
            "type": "index",
            "file": "posts/posts-home.tsx"
          },
          {
            "type": "route",
            "file": "posts/posts-detail.tsx",
            "path": "$postId"
          }
        ]
      },
      {
        "type": "layout",
        "id": "first",
        "file": "layout/first-layout.tsx",
        "children": [
          {
            "type": "layout",
            "id": "second",
            "file": "layout/second-layout.tsx",
            "children": [
              {
                "type": "route",
                "file": "a.tsx",
                "path": "/layout-a"
              },
              {
                "type": "route",
                "file": "b.tsx",
                "path": "/layout-b"
              }
            ]
          }
        ]
      }
    ]
  }
}
```
