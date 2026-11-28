---
title: Automatic Code Splitting
---

The automatic code splitting feature in TanStack Router allows you to optimize your application's bundle size by lazily loading route components and their associated data. This is particularly useful for large applications where you want to minimize the initial load time by only loading the necessary code for the current route.

To turn this feature on, simply set the `autoCodeSplitting` option to `true` in your bundler plugin configuration. This enables the router to automatically handle code splitting for your routes without requiring any additional setup. It is available with Vite, Rspack/Rsbuild and Webpack, not with Esbuild.

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

Route properties like `component`, `loader`, etc., should not be exported from the route file. Exporting these properties results in them being bundled into the main application bundle, which means that they will not be code-split. The build warns once, at the first such export, naming the file and the exports.

```tsx
export const Route = createFileRoute('/posts')({
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

#### Where top-level code goes

- Code only a split property uses (a helper, a constant, an import) moves into that property's chunk, and its initialiser runs when the chunk loads.
- Code several properties read (two split properties, or a split one and one that stays, such as the `loader`) exists once, in one shared module the route file and the chunks import, unless it reads `Route`: then each chunk has its own copy. `Route` and what `export const` declares exist once too: chunks import them from the route file.
- Top-level statements (`Sentry.init()`, `registry.set(…)`, an `if` block) stay in the route file and run when it loads. A declaration or import that only moved code used (in a type too) is removed when nothing left in the route file reads it. Code nothing used to begin with stays in the route file, and runs once.
- Other code a split chunk shares with the route file (a value an exported function or a top-level statement also uses, an exported function or class) is copied into the chunk, with the top-level statements that use it: the chunk has its own instance, and those statements run again when it loads. Assigning a variable is not reading it: a `let` a property that stays only assigns (`beforeLoad: () => { user = … }`) and a split property reads is two variables, and the split one never sees the assignment. To keep one instance, read it from an option that stays or export it with `export const`.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createStore } from '../store'

// the loader and the component read it: one shared module both import
const store = createStore()

// moves into the component's chunk
function PostList() {
  return (
    <ul>
      {store.posts.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  )
}

export const Route = createFileRoute('/posts')({
  loader: () => store.load(),
  component: PostList,
})
```

#### What stays in the route file

A property is not split when its value is `true`, `false`, `null` or `undefined` (the parent's applies), when it is an exported binding (see above), or when it is written as a getter or setter, a spread or a computed key. A method (`loader() {}`, `async loader() {}`) is split as a function would be. Some values cannot be split and keep working in the route file: a member of an object or of a namespace import (`pages.Home`), a value in `satisfies` or with a `!`, a class, an array-pattern binding, a sequence, and a call whose arguments hold JSX or TypeScript syntax (`memo(() => <p />)`; `memo(Page)` is split). A loader object written in the route options (`loader: { handler, staleReloadMode }`) splits its `handler` the way a function loader is split, and the object with its other options stays in the route file; it stays whole when its `handler` is a getter or followed by a spread. A loader object held by a local `const` (`const loader = { handler, staleReloadMode }`, then `loader` in the options) stays whole in the route file. Any other object is not supported when the loader is split: one that is imported, returned by a call (`Object.freeze({ … })`) or chosen by a condition. Write it in the route options or in a local `const`. A split property whose code would assign a variable the route file or another split property also uses (`count++` on a module `let` the `loader` or the split `component` reads) stays in the route file too, so there is one variable.

A function or method that uses its own `this` or `super` stays in the route file as written, because splitting can change what `this` refers to. `this` inside an arrow function counts; inside a nested `function`, method or class it is that function's own and does not. The build warns at the property, for example:

```txt
[tanstack-router] The `loader` option of src/routes/posts.tsx uses `this`, so it is not code-split (splitting can change what `this` refers to). Use an arrow function or avoid `this` to split it.
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

Write the groupings in the route file, as an array literal or a `const` declared there: the compiler reads them from the file and cannot read an imported value. Each group lists options that can be split (`loader`, `component`, `pendingComponent`, `errorComponent`, `notFoundComponent`), each option in one group at most. Groupings that break these rules fail the build, positioned at the value, and so do invalid ones returned by `splitBehavior` or set as `defaultBehavior`.

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
