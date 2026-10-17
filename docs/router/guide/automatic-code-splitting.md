---
title: Automatic Code Splitting
---

The automatic code splitting feature in TanStack Router allows you to optimize your application's bundle size by lazily loading route components and their associated data. This is particularly useful for large applications where you want to minimize the initial load time by only loading the necessary code for the current route.

To turn this feature on, simply set the `autoCodeSplitting` option to `true` in your bundler plugin configuration. This enables the router to automatically handle code splitting for your routes without requiring any additional setup.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true, // Enable automatic code splitting
    }),
  ],
})
```

But that's just the beginning! TanStack Router's automatic code splitting is not only easy to enable, but it also provides powerful customization options to tailor how your routes are split into chunks. This allows you to optimize your application's performance based on your specific needs and usage patterns.

## How does it work?

TanStack Router's automatic code splitting works by transforming your route files both during 'development' and at 'build' time. It rewrites the route definitions to use lazy-loading wrappers for components and loaders, which allows the bundler to group these properties into separate chunks.

> [!TIP]
> A **chunk** is a file that contains a portion of your application's code, which can be loaded on demand. This helps reduce the initial load time of your application by only loading the code that is needed for the current route.

So when your application loads, it doesn't include all the code for every route. Instead, it only includes the code for the routes that are initially needed. As users navigate through your application, additional chunks are loaded on demand.

This happens seamlessly, without requiring you to manually split your code or manage lazy loading. The TanStack Router bundler plugin takes care of everything, ensuring that your routes are optimized for performance right out of the box.

### The transformation process

When you enable automatic code splitting, the bundler plugin does this by using static code analysis to look at the code in your route files and to transform them into optimized outputs.

This transformation process produces two key outputs when each of your route files are processed:

1. **Reference File**: The bundler plugin takes your original route file (e.g., `posts.route.tsx`) and modifies the values for properties like `component` or `pendingComponent` to use special lazy-loading wrappers that'll fetch the actual code later. These wrappers point to a "virtual" file that the bundler will resolve later on.
2. **Virtual File**: When the bundler sees a request for one of these virtual files (e.g., `posts.route.tsx?tsr-split=component`), it intercepts it to generate a new, minimal on-the-fly file that _only_ contains the code for the requested properties (e.g., just the `PostsComponent`).

This process ensures that your original code remains clean and readable, while the actual bundled output is optimized for initial bundle size.

### What gets code split?

The decision of what to split into separate chunks is crucial for optimizing your application's performance. TanStack Router uses a concept called "**Split Groupings**" to determine how different parts of your route should be bundled together.

Split groupings are arrays of properties that tell TanStack Router how to bundle different parts of your route together. Each grouping is a list of property names that you want to bundle together into a single lazy-loaded chunk.

The available properties to split are:

- `component`
- `errorComponent`
- `pendingComponent`
- `notFoundComponent`
- `loader`

By default, TanStack Router uses the following split groupings:

```sh
[
  ['component'],
  ['errorComponent'],
  ['notFoundComponent']
]
```

This means that it creates three separate lazy-loaded chunks for each route. Resulting in:

- One for the main component
- One for the error component
- And one for the not-found component.

### Rules of Splitting

For automatic code splitting to work, there are some rules in place to make sure that this process can happen reliably and predictably.

#### Do not export route properties

Route properties like `component`, `loader`, etc., should not be exported from the route file. Exporting these properties results in them being bundled into the main application bundle, which means that they will not be code-split.

```tsx
export const Route = createRoute('/posts')({
  // ...
  notFoundComponent: PostsNotFoundComponent,
})

// ❌ Do NOT do this!
// Exporting the notFoundComponent will prevent it from being code-split
// and will be included in the main bundle.
export function PostsNotFoundComponent() {
  // ❌
  // ...
}

function PostsNotFoundComponent() {
  // ✅
  // ...
}
```

**That's it!** There are no other restrictions. You can use any other JavaScript or TypeScript features in your route files as you normally would. If you run into any issues, please [open an issue](https://github.com/tanstack/router/issues) on GitHub.

## Granular control

For most applications, the default behavior of using `autoCodeSplitting: true` is sufficient. However, TanStack Router provides several options to customize how your routes are split into chunks, allowing you to optimize for specific use cases or performance needs.

### Global code splitting behavior (`defaultBehavior`)

You can change how TanStack Router splits your routes by changing the `defaultBehavior` option in your bundler plugin configuration. This allows you to define how different properties of your routes should be bundled together.

For example, to bundle all UI-related components into a single chunk, you could configure it like this:

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      codeSplittingOptions: {
        defaultBehavior: [
          [
            'component',
            'pendingComponent',
            'errorComponent',
            'notFoundComponent',
          ], // Bundle all UI components together
        ],
      },
    }),
  ],
})
```

### Advanced programmatic control (`splitBehavior`)

For complex rulesets, you can use the `splitBehavior` function in your vite config to programmatically define how routes should be split into chunks based on their `routeId`. This function allows you to implement custom logic for grouping properties together, giving you fine-grained control over the code splitting behavior.

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      codeSplittingOptions: {
        splitBehavior: ({ routeId }) => {
          // For all routes under /posts, bundle the loader and component together
          if (routeId.startsWith('/posts')) {
            return [['loader', 'component']]
          }
          // All other routes will use the `defaultBehavior`
        },
      },
    }),
  ],
})
```

### Per-route overrides (`codeSplitGroupings`)

For ultimate control, you can override the global configuration directly inside a route file by adding a `codeSplitGroupings` property. This is useful for routes that have unique optimization needs.

```tsx title="src/routes/posts.route.tsx"
import { loadPostsData } from './-heavy-posts-utils'

export const Route = createFileRoute('/posts')({
  // For this specific route, bundle the loader and component together.
  codeSplitGroupings: [['loader', 'component']],
  loader: () => loadPostsData(),
  component: PostsComponent,
})

function PostsComponent() {
  // ...
}
```

This will create a single chunk that includes both the `loader` and the `component` for this specific route, overriding both the default behavior and any programmatic split behavior defined in your bundler config.

### Configuration order matters

This guide has so far describe three different ways to configure how TanStack Router splits your routes into chunks.

To make sure that the different configurations do not conflict with each other, TanStack Router uses the following order of precedence:

1. **Per-route overrides**: The `codeSplitGroupings` property inside a route file takes the highest precedence. This allows you to define specific split groupings for individual routes.
2. **Programmatic split behavior**: The `splitBehavior` function in your bundler config allows you to define custom logic for how routes should be split based on their `routeId`.
3. **Default behavior**: The `defaultBehavior` option in your bundler config serves as the fallback for any routes that do not have specific overrides or custom logic defined. This is the base configuration that applies to all routes unless overridden.

### Splitting the Data Loader

The `loader` function is responsible for fetching data needed by the route. By default, it is bundled with into your "reference file" and loaded in the initial bundle. However, you can also split the `loader` into its own chunk if you want to optimize further.

> [!CAUTION]
> Moving the `loader` into its own chunk is a **performance trade-off**. It introduces an additional trip to the server before the data can be fetched, which can lead to slower initial page loads. This is because the `loader` **must** be fetched and executed before the route can render its component.
> Therefore, we recommend keeping the `loader` in the initial bundle unless you have a specific reason to split it.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      codeSplittingOptions: {
        defaultBehavior: [
          ['loader'], // The loader will be in its own chunk
          ['component'],
          // ... other component groupings
        ],
      },
    }),
  ],
})
```

We highly discourage splitting the `loader` unless you have a specific use case that requires it. In most cases, not splitting off the `loader` and keep it in the main bundle is the best choice for performance.

> **Experimental:** the route `context` option and the `dehydrate` and `hydrate` keys of `beforeLoad` and `loader` are experimental and subject to change.

A loader written in the object form, `loader: { handler, dehydrate, hydrate, staleReloadMode }`, is split by its `handler` only: the chunk exports the handler, while `dehydrate`, `hydrate` and `staleReloadMode` stay in the reference file, where the router reads them without loading the chunk. The same applies to an object declared as a `const` in the same file and passed by name (`const postsLoader = { handler, dehydrate: true }` and `loader: postsLoader`) when `loader` is the only place that reads it: the object stays in the reference file with its `handler` replaced. A type that names the object, such as `Awaited<ReturnType<typeof postsLoader.handler>>`, does not count as a reader. A `handler` written as a getter (`get handler() { ... }`) or as a method that uses `super` is not split. Neither is an object held in a variable that is exported, reassigned, or read anywhere else in the file (another option such as `head` calling `postsLoader.handler(ctx)`, top-level code, or the handler itself): replacing the handler in the object would hand every reader the lazy wrapper instead of your function. When a split option such as `component` or `errorComponent` reads that variable, the object moves to the shared module, so the route and the chunk read one object. An object-form loader imported from another module or returned by a function cannot be told apart from a function: do not put `loader` in a split group for such a route, or the chunk exports the object and calling the loader fails.

### Removing route options from a build (`deleteNodes`)

> **Experimental:** the route `context` option and the `dehydrate` and `hydrate` keys of `beforeLoad` and `loader` are experimental and subject to change.

`deleteNodes` lists route options that the plugin removes from the compiled route file. An entry is a key of the route options object (`'ssr'`) or a dot path into an option written in the object form (`'loader.dehydrate'`, `'context.hydrate'`). The removed code and any import that only this code used disappear from the output; the rest of the file is unchanged.

The list applies to every module the plugin instance compiles, for the browser and for the server alike. A router-only setup that renders on the server compiles both builds with one `tanstackRouter()`, and in development the dev server compiles the modules it renders on the server through that same plugin. The two builds need different keys: only the server reads `ssr` and `dehydrate`, and only the client reads `hydrate`. So give each production build its own list, and none in development:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig(({ command, isSsrBuild }) => ({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      codeSplittingOptions: {
        // `vite build` is the client build, `vite build --ssr` the server
        // build; the dev server compiles both, so it removes nothing
        deleteNodes:
          command !== 'build'
            ? undefined
            : isSsrBuild
              ? ['loader.hydrate']
              : ['ssr', 'loader.dehydrate'],
      },
    }),
  ],
}))
```

With this configuration, the route file

```tsx
import { fetchPosts } from './posts'
import { toWire } from './server-only'
import { fromWire } from './client-only'

export const Route = createFileRoute('/posts')({
  ssr: 'data-only',
  loader: {
    handler: ({ params }) => fetchPosts(params),
    dehydrate: ({ data }) => toWire(data),
    hydrate: ({ data }) => fromWire(data),
  },
})
```

compiles to this in the client build:

```tsx
import { fetchPosts } from './posts'
import { fromWire } from './client-only'

export const Route = createFileRoute('/posts')({
  loader: {
    handler: ({ params }) => fetchPosts(params),
    hydrate: ({ data }) => fromWire(data),
  },
})
```

The server build keeps `ssr` and `dehydrate` and drops `hydrate` together with the `./client-only` import.

The plugin visits:

- The options object literal passed to `createFileRoute`, `createRootRoute` or `createRootRouteWithContext`, written inline or held in a variable of the same file and passed by name, also behind `satisfies` or `as`.
- Object-form values written inline, or held in a variable of the same file that is never reassigned and passed by name (`loader: postsLoader`), also behind a TypeScript wrapper such as `satisfies`, `as`, `!` or parentheses. Such a variable is stripped in every module that keeps it: the route file, the shared module when a split option reads it, and a chunk that keeps a copy for top-level code reading it. If it is exported, the modules that import it get it without the removed keys too. An object-form value held in a variable that is reassigned is left as written.

It does not visit spread members (`...sharedOptions`), computed keys, or option objects that are imported from another module or returned by a function. Those are left as they are, without a build error.

A function or variable that only the removed code used is removed with it, and so are its imports. A class declaration is not: it stays, and keeps its imports.

Removing an option is a bundle-size optimization, not a way to hide code. A value that must not reach the client has to live in a module the client never imports.

TanStack Start configures these lists itself: its client build removes `ssr`, `server`, `headers` and the `dehydrate` key of `context`, `beforeLoad` and `loader`; its server build removes the `hydrate` key of the three and `context.revalidate`. A `deleteNodes` list in your own Start router configuration applies to both the client and the server build, with the built-in entries added after it, so it should only name options that neither build reads.
