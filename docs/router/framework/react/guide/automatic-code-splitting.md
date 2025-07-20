---
title: Automatic Code Splitting
---

Automatic code splitting is the most powerful and recommended method for optimizing your application's bundle size when using TanStack Router with a supported bundler. It gives you fine-grained, declarative control over how and what parts of your route definitions are lazy-loaded.

## How it Works: Under the Hood

The magic behind automatic code splitting is a build-time code transformation process handled by the router plugin. It analyzes your route files and rewrites them into an optimized format. This happens in two phases:

1.  **Reference File Transformation**: The plugin takes your original route file (e.g., `posts.route.tsx`) and replaces properties like `component` or `loader` with special lazy-loading wrappers (`lazyRouteComponent` or `lazyFn`). These wrappers point to a "virtual" file that the bundler will request later.
2.  **Virtual File Generation**: When the bundler sees a request for one of these virtual files (e.g., `posts.route.tsx?tsr-split=component`), the plugin intercepts it. It then generates a new, minimal file on-the-fly that contains _only_ the code for the requested property (e.g., just the `PostsComponent`).

This process ensures that your original code remains clean and readable, while the final bundled output is optimized for initial bundle size.

## Configuration Deep Dive

While `autoCodeSplitting: true` works out of the box, you can customize its behavior in your bundler plugin's configuration.

### Understanding `CodeSplitGroupings`

The core of customization is the concept of "split groupings". A split grouping is an array of property names that you want to bundle together into a single lazy-loaded chunk. The configuration is an array of these groups.

The available properties to split are:

- `component`
- `errorComponent`
- `pendingComponent`
- `notFoundComponent`
- `loader`

### Default Behavior

By default, the plugin uses the following groupings:
`[['component'], ['errorComponent'], ['notFoundComponent']]`

This means it creates up to three separate lazy-loaded chunks for each route: one for the main component, one for the error component, and one for the not-found component.

### Customizing Global Behavior (`defaultBehavior`)

You can change the default for all routes using the `defaultBehavior` option. For example, to bundle all UI-related components into a single chunk, you could configure it like this:

```ts
// vite.config.ts
tanstackRouter({
  autoCodeSplitting: true,
  codeSplittingOptions: {
    defaultBehavior: [
      ['component', 'pendingComponent', 'errorComponent', 'notFoundComponent'],
    ],
  },
})
```

Now, `component`, `pendingComponent`, `errorComponent`, and `notFoundComponent` will all be included in the same network request, reducing request overhead if they are often used together.

### Splitting the Data Loader

> [!IMPORTANT] > **Be warned!** Splitting a route loader needs to be considered carefully.
> Splitting the `loader` introduces an additional asynchronous step before data fetching can even begin, which can negatively impact performance. The `loader` is often a critical asset for preloading data. We recommend keeping it in the initial bundle.

However, if your loader contains significant logic or large dependencies and you've decided to split it, you can add it to your split groupings:

```ts
// vite.config.ts
tanstackRouter({
  autoCodeSplitting: true,
  codeSplittingOptions: {
    defaultBehavior: [
      ['loader'], // The loader will be in its own chunk
      ['component'],
      // ... other component groupings
    ],
  },
})
```

### Per-Route Overrides (`codeSplitGroupings`)

For ultimate control, you can override the global configuration directly inside a route file by adding a `codeSplitGroupings` property. This is useful for routes that have unique optimization needs.

```tsx
// src/routes/admin.route.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin')({
  // For this specific route, bundle the loader and component together.
  codeSplitGroupings: [['loader', 'component']],
  loader: () => import('./-heavy-admin-utils').then((d) => d.loadAdminData()),
  component: AdminComponent,
})

function AdminComponent() {
  // ...
}
```

### Advanced Programmatic Control (`splitBehavior`)

For complex rulesets, you can use the `splitBehavior` function in your vite config. This function receives the `routeId` and can programmatically return the desired split groupings.

```ts
// vite.config.ts
tanstackRouter({
  autoCodeSplitting: true,
  codeSplittingOptions: {
    splitBehavior: ({ routeId }) => {
      // For all routes under /admin, bundle the loader and component together
      if (routeId.startsWith('/admin')) {
        return [['loader', 'component']]
      }
      // All other routes will use the `defaultBehavior`
    },
  },
})
```

