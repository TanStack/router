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

#### Exported route properties

A route property such as `component` or `notFoundComponent` may be exported from the route file: it is still code-split. The split chunk carries its own copy of a function or component that uses only functions and constants, while other modules that import it from the route file share one instance through a small module of its own, so exporting a page component for tests or reuse costs nothing in the main bundle. A class, an object, or a value a call returns exists once: the chunk and other modules importing it from the route file share that small module.

Three cases keep an exported binding in the main bundle, and the build warns once, naming the file (the dev server warns for the first):

- the binding has state or effects (an initialiser with side effects, a `let` the module reassigns, a value read from mutable state when the module loads, a component the file augments with `Page.displayName = …`), so one instance must exist and the route module keeps it;
- another module loaded with the entry imports the binding through the route file, so the bundler keeps it with the route module;
- the binding is a class, an object or a call result the chunk must share, and the bundler's chunk configuration (a `manualChunks` or `cacheGroups` group that lands in the entry, Rolldown < 1.1.5) placed its module with the entry.

In every case, move the binding to its own module and import it from there.

```tsx
export const Route = createRoute('/posts')({
  // ...
  notFoundComponent: PostsNotFoundComponent,
})

// ✅ split: the chunk carries its copy, importers share one instance
export function PostsNotFoundComponent() {
  // ...
}

// ⚠️ warns and stays in the main bundle: its initialiser has side effects
export const store = createStore()
```

#### Top-level side effects keep their order

A top-level declaration with side effects that only split code reads (for example `const confetti = new JSConfetti()`, used only by the component) moves into the split chunk and runs when the chunk loads. It stays in the main bundle, and runs when the route file loads, if a side effect written after it stays in the route file, such as an inline call in an option that is not split (`validateSearch: z.object({ … })`). Moving the declaration would run it after that call, and the route file's side effects keep the order they are written in. The same declaration also stays when several split properties read it (its side effects run once), when the route file changes it at the top level (`registry.add(…)`), or when it reads, as the file loads, a value that has side effects and stays, or that the file changes later. The build (and the dev server) warns once for each such declaration, naming it, what keeps it and the line, for example:

```
`confetti` in "src/routes/account.tsx" stays in the route module because the call `type(…)` in
`validateSearch` (line 14) runs after it and stays; declare `confetti` after `Route`, create that value
in a `const` before `confetti`, or mark the call `/* @__PURE__ */` if it has no side effects, so
`confetti` can load with the split `component`.
```

Any of these lets the declaration load with the split chunk, from the least to the most effort:

- **Declare it after the route.** A declaration written after `createFileRoute(…)({ … })` comes after the call in the file, so loading it later with the chunk keeps the order:

  ```tsx
  export const Route = createFileRoute('/account')({
    validateSearch: type({ 'success?': 'boolean' }),
    component: AccountPage,
  })

  // ✅ split: nothing that stays in the route file runs after it
  const confetti = new JSConfetti()
  ```

- **Create the value the option uses before it**, in the same file or in a module of its own (`validateSearch: searchSchema`, imported or declared above):

  ```tsx
  const searchSchema = type({ 'success?': 'boolean' })
  // ✅ split: no side effect after it stays in the route file
  const confetti = new JSConfetti()

  export const Route = createFileRoute('/account')({
    validateSearch: searchSchema,
    component: AccountPage,
  })
  ```

- **Move the declaration to a module of its own** that only the component imports (`import { confetti } from '../-confetti'`): the import moves into the chunk with the component, so the module loads with it.
- **Create it on first use**, for example `let instance; const getConfetti = () => (instance ??= new JSConfetti())`: a function has no side effects when it is declared.
- **Tell the compiler that the call has no side effects**, with one of these annotations:
  - `/* @__PURE__ */` before the call (`validateSearch: /* @__PURE__ */ type({ … })`), whatever the function is;
  - `/* #__NO_SIDE_EFFECTS__ */` on a function declared in the route file itself: `/* #__NO_SIDE_EFFECTS__ */ function makeSchema(…) { … }` or `const makeSchema = /* #__NO_SIDE_EFFECTS__ */ (…) => …`, exported or not, declared before or after the call.

  The call then runs when the route file loads, which may be before the declaration: annotate only calls whose order does not matter.

These do not change what the route file keeps, because the route file is split without reading the modules it imports or the bundler's options:

- `/* #__NO_SIDE_EFFECTS__ */` on a function imported from another module, one of the app's or a package's (for example valibot's functions): annotate the call with `/* @__PURE__ */` instead;
- `"sideEffects": false` in the package.json of the function's package: it says that importing the package's modules has no side effects, not that calling their functions has none;
- the bundler's list of pure functions (`treeshake.manualPureFunctions` of Rolldown and Rollup, esbuild's `pure`, Terser's `pure_funcs`).

#### Route callbacks that read `this` are not split

A route option written as a method or a function expression whose body reads `this` stays in the route file, and the build warns once, naming the file. Write such callbacks as arrow functions (or without `this`) to have them split.

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
