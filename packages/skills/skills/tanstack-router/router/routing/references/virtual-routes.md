# Virtual File Routes

Programmatically define file-based routes without physical files.

## Use Cases

- Generate routes from CMS or database
- Dynamic route creation at build time
- Migrate from other routers gradually

## Setup

```ts
// vite.config.ts
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      virtualRouteConfig: './routes.config.ts',
    }),
  ],
})
```

## Route Configuration

```ts
// routes.config.ts
import {
  rootRoute,
  route,
  index,
  layout,
  physical,
} from '@tanstack/virtual-file-routes'

export const routes = rootRoute('root.tsx', [
  index('home.tsx'),
  route('/about', 'about.tsx'),

  // Layout with children
  layout('posts-layout.tsx', [
    route('/posts', 'posts/index.tsx', [route('$postId', 'posts/post.tsx')]),
  ]),

  // Include physical file-based routes
  physical('/docs', 'docs'),
])
```

## API Reference

### rootRoute(file, children)

Define the root route with its component file.

### route(path, file, children?)

Define a route with URL path and component file.

### index(file)

Define an index route (matches parent path exactly).

### layout(file, children)

Define a pathless layout that wraps children.

### physical(path, directory)

Include file-based routes from a directory.

## Generated Output

The config generates the same `routeTree.gen.ts` as physical files:

```tsx
// routeTree.gen.ts (auto-generated)
export const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  postsLayoutRoute.addChildren([postsIndexRoute, postRoute]),
])
```

## Mixing Physical and Virtual

Combine both approaches:

```ts
export const routes = rootRoute('root.tsx', [
  // Virtual routes
  route('/dashboard', 'dashboard.tsx'),

  // Physical routes from directory
  physical('/blog', 'routes/blog'),
])
```
