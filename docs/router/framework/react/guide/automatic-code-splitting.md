---
title: Automatic Code Splitting
---

The automatic code splitting feature in TanStack Router allows you to optimize your application's bundle size by lazily loading route components and their associated data. This is particularly useful for large applications where you want to minimize the initial load time by only loading the necessary code for the current route.

To turn this feature on, simply set the `autoCodeSplitting` option to `true` in your bundler plugin configuration. This enables the router to automatically handle code splitting for your routes without requiring any additional setup.

```ts
// vite.config.ts
import { tanstackRouter } from '@tanstack/react-router/vite'

export default {
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true, // Enable automatic code splitting
    }),
  ],
}
```

But that's just the beginning! TanStack Router's automatic code splitting is not only easy to enable, but it also provides powerful customization options to tailor how your routes are split into chunks. This allows you to optimize your application's performance based on your specific needs and usage patterns.

## What is a Chunk?

In the context of web applications, a "chunk" refers to a separate file that contains a portion of your application's code. When you enable automatic code splitting, the router generates these chunks for each route or specific properties of a route (like components and loaders). This means that when a user navigates to a route, only the necessary code for that route is loaded, rather than the entire application at once.

## How does it work?

TanStack Router's automatic code splitting works by transforming your route files at build time. It rewrites the route definitions to use lazy-loading wrappers for components and loaders, which allows the bundler to group these properties into separate chunks.

So when your application loads, it doesn't include all the code for every route. Instead, it only includes the code for the routes that are initially needed. As users navigate through your application, additional chunks are loaded on demand.

This magic happens seamlessly, without requiring you to manually split your code or manage lazy loading. The router plugin takes care of everything, ensuring that your routes are optimized for performance right out of the box.

This transformation process produces two key outputs when each of your route files are processed:

1. **Reference File**: The plugin takes your original route file (e.g., `posts.route.tsx`) and modifies the values for properties like `component` or `pendingComponent` to use special lazy-loading wrappers that'll fetch the actual code later. These wrappers point to a "virtual" file that the bundler will resolve later on.
2. **Virtual File Generation**: When the bundler sees a request for one of these virtual files (e.g., `posts.route.tsx?tsr-split=component`), it intercepts it to generate a new, minimal file on-the-fly that _only_ contains the code for the requested property (e.g., just the `PostsComponent`).

This process ensures that your original code remains clean and readable, while the actual bundled output is optimized for initial bundle size.

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
