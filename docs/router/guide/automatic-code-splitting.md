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

#### Top-level code: where it goes and when it runs

Everything at the top level of a route file exists once and runs once. It lives with the code that uses it: one split option's chunk, the route file, or one shared module that several chunks import. A statement goes where the bindings it uses go. What moves runs when its chunk loads.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Confetti } from '../confetti'
import { registry } from '../registry'

// ✅ both move into the component's chunk and run when it loads
const confetti = new Confetti({ colors: ['gold'] })
registry.add(confetti, 'account-confetti')

export const Route = createFileRoute('/account')({
  validateSearch: z.object({ success: z.boolean().optional() }),
  component: () => <button onClick={() => confetti.fire()} />,
})
```

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createAnalytics } from '../analytics'

// ✅ one shared module for the component and the error component
const analytics = createAnalytics('posts-analytics')

export const Route = createFileRoute('/posts')({
  component: () => <button onClick={() => analytics.track('post-opened')} />,
  errorComponent: () => (
    <button onClick={() => analytics.track('post-retried')} />
  ),
})
```

Startup code moves too when only split code uses what it touches:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Sentry } from '../sentry'

const sentryConfig = { dsn: 'https://sentry.example.com/1' }
// runs when the component's chunk loads, not when the app starts
Sentry.init(sentryConfig)

export const Route = createFileRoute('/about')({
  component: () => <p>{sentryConfig.dsn}</p>,
})
```

Keep work that must run when the app starts in a module the app's entry imports. In a TanStack Start app, startup work only a server function's handler uses moves with the handler and runs on the first call of a server function of the file.

Exports follow the same rule. An exported binding only split code uses moves to a module of its own, which the chunk imports and other files importing it through the route file share; an exported `let` takes the code assigning it along, and importers still read its current value. An exported route option (`export function PostsNotFoundComponent`) is still split.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createStore, log } from '../store'

// ✅ split: a module of its own, which the chunk imports
export const store = createStore('cart-store')
store.subscribe(log)

export const Route = createFileRoute('/cart')({
  component: () => <p>{store.count}</p>,
})
```

#### When code stays: the warnings

Code the route file itself uses (its `loader`, `beforeLoad`, `validateSearch`…) stays there, silently. When only split code uses a binding and it stays anyway, because moving it would change what the file computes, the build warns once, at the binding:

| Code                                                                                                                                                                     | The build says                                                                                                                                                                                                                                                                                                                                       | Fix                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| One statement changes `theme`, which only the component uses, and `session`, which `beforeLoad` reads: `if (…) { theme.banner = 'Local build'; session.secure = false }` | ``[tanstack-router] `theme` in src/routes/settings.tsx stays in the route module because the statement on line 6, which changes it, stays there: it also changes `session`, which the route module keeps; change `session` in a statement of its own, so `theme` can load with the split `component`.``                                              | Two statements: `if (…) { theme.banner = 'Local build' }` and `if (…) { session.secure = false }`          |
| A value read at load from state the file changes later: `const initialTheme = prefs.theme`, and `prefs.theme = readTheme()` in a `storage` listener                      | ``[tanstack-router] `initialTheme` in src/routes/theme.tsx stays in the route module because it uses `prefs` when the module loads, and the module writes `prefs`; use `prefs` inside the code that needs it, or move both to their own module, so `initialTheme` can load with the split `component`.``                                             | Read it where it is used: `component: () => <p>{prefs.theme}</p>`                                          |
| A function handed to a call reads such state: `const save = debounce(() => savePrefs(prefs))`                                                                            | ``[tanstack-router] `save` in src/routes/preferences.tsx stays in the route module because it may use `prefs` when the module loads (the function is handed to `debounce`), and the module writes `prefs`; move both to their own module, so `save` can load with the split `component`.``                                                           | Move `prefs`, its listener and `save` to their own module, and import `save` from there                    |
| Unused code reads the bindings of two chunks: `function debugDump() { return [cache, client] }`                                                                          | ``[tanstack-router] In src/routes/dashboard.tsx, unused `debugDump` (line 6) puts `cache` and `client` in one shared module the split `component` and `errorComponent` import; delete `debugDump`, so each loads with the split code that needs it.``                                                                                                | Delete `debugDump`                                                                                         |
| Unused code reads a binding the route file keeps: `function debugDump() { return [cache, session] }`, with `session` read by `beforeLoad`                                | ``[tanstack-router] In src/routes/inbox.tsx, unused `debugDump` (line 6) keeps `cache` in the route module; delete `debugDump`, so it can load with the split code that needs it.``                                                                                                                                                                  | Delete `debugDump`                                                                                         |
| An export only split code uses reads, at load, what the route file keeps: `export const pageSize = settings.pageSize * 2`, with `settings` read by the `loader`          | ``[tanstack-router] The export `pageSize` of src/routes/list.tsx is used only by the split `component`, but stays in the route module because it reads `settings` when it loads, which the route module keeps, so it loads with the route module instead of with that code. Move it and `settings` to their own module and import them from there.`` | Don't export it if no other file imports it (it then moves), or move it and `settings` to their own module |
| A split option assigns a `let` the route file uses: `let count = 0`, read by the `loader`, and `count++` in the component                                                | ``[tanstack-router] The `component` option of src/routes/counter.tsx is not code-split: it writes `count`, which the route module also uses, and a split chunk cannot write a binding of another module. Keep that state in an object (`state.count`) or in its own module.``                                                                        | Keep the state in an object: `const state = { count: 0 }`, then `state.count++`                            |

#### What the compiler doesn't see

In these cases code moves without a warning, and what moved can see other values than the file as written. The compiler reads the route file, not the modules it imports: it assumes an imported function changes nothing it is handed and returns a new value, and that a call making a route option's value keeps the function it is handed for later. Route files are rewritten heavily: keep such code in a module of its own.

**Code inside imported functions.** Writing `prefs.theme = …` in the route file is seen (the second warning above); `mutate(prefs)` is not. Likewise, an imported call that names nothing of the file, such as `connectEmulator()`, stays and runs before an `initializeApp()` that moved.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { loadPrefs, mutate } from '../prefs'

const prefs = loadPrefs()
const initialTheme = prefs.theme // moves: reads `prefs` after `mutate` ran
mutate(prefs) // stays with `prefs`, which the loader reads

export const Route = createFileRoute('/look')({
  loader: () => prefs.theme,
  component: () => <p>{initialTheme}</p>,
})
```

**A call result that is the object it was handed:**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { reactive } from '../reactive'

const settings = { dark: false }
const keys = Object.keys(settings) // moves: sees `compact`
const store = reactive(settings) // the same object as `settings`
Object.assign(store, { compact: true }) // stays with `store`

export const Route = createFileRoute('/keys')({
  loader: () => store,
  component: () => <p>{keys.join()}</p>,
})
```

**A callback registered at load** moves with what it writes:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { loadFlags } from '../flags'

let flags = {}
// moves with `flags`: the request starts when the component's chunk loads
loadFlags().then((f) => {
  flags = f
})

export const Route = createFileRoute('/beta')({
  component: () => <p>{JSON.stringify(flags)}</p>,
})
```

**A component factory that runs its function at once.** A call making a route option's value is read as keeping the function for the router to call later, as `memo`, `observer` or an app's `withAuth` do:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createIcon } from '../icon'

const seen = new Set<string>()

export const Route = createFileRoute('/icon')({
  loader: () => {
    seen.add('icon')
  },
  // createIcon calls its function at once: it runs when the chunk loads,
  // after the loader added to `seen`
  component: createIcon(() => {
    const count = seen.size
    return () => <p>{count}</p>
  }),
})
```

**An export another module imports through the route file.** When it moved to a module of its own, that module runs before the route file's own code:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { formatCount, recordVisit, visits } from '../visits'

recordVisit()
// moves to a module of its own; imported through this file, it runs first
export const label = formatCount(visits)

export const Route = createFileRoute('/visits')({
  component: () => <p>{label}</p>,
})
```

#### Route callbacks that read `this` are not split

A route option written as a method or a function expression whose body reads `this` stays in the route file, and the build warns once, naming the file. The router calls these callbacks without a `this` (it is `undefined`); only code calling `Route.options.loader()` itself passes the route options, which a split chunk would not. Write such callbacks as arrow functions (or without `this`) to have them split.

#### A split loader the compiler cannot read

A `loader` can be a function or an object (`{ handler, staleReloadMode }`), and the router reads the object's options from the route file before a split chunk could load. A split `loader` whose value the route file does not show as a function or an object literal (an imported loader, a call such as `createPostsLoader()`, a conditional, `api.load`), directly or through `const`s, stays in the route file, and the build warns once, naming the file. Write the loader in the route options (`loader: { handler, staleReloadMode }`), or call the function from one written there:

```tsx
import { fetchPosts } from '../posts'

export const Route = createFileRoute('/posts')({
  loader: (ctx) => fetchPosts(ctx), // split; `loader: fetchPosts` is not
})
```

In a loader object, a spread or a computed key written after `handler` may replace it: such a loader stays in the route file too, with a warning. Put the spread before `handler` (`loader: { ...options, handler }`) to have the handler split; the route file keeps the options.

#### A split loader written as a server function in place (TanStack Start)

In a TanStack Start app, a server function written in place as the `handler` of a split object-form loader (`loader: { handler: createServerFn().handler(…) }`) fails the build, positioned at the server function: Start moves such a server function to the top of the module, and the split chunk cannot take the same code. Declare it as a module-level `const` before the route and pass it by name (`const loaderFn = createServerFn().handler(…)`, then `loader: { handler: loaderFn }`). Written as the `loader` itself, a server function is a call: it stays in the route file with the warning above (`loader: (ctx) => loaderFn(ctx)` splits it).

#### Reference: copies, calls without side effects, bundlers

- **Copies.** A function or a constant that has no side effects and that nothing writes may be copied into each chunk that uses it rather than shared: nothing can tell the copy from the original. An exported one is copied into the chunks, and other files importing it through the route file share one instance. A class, an object, or a value a call returns is never copied.
- **Calls without side effects.** Such a value can be copied, and a declaration reading it at load does not stay for it. The compiler knows these calls have none when their arguments have none: TanStack Router's `getRouteApi`, `linkOptions`, `createLink`, `createRouteMask`, `lazyRouteComponent`, `lazyFn`, `retainSearchParams`, `stripSearchParams`, `parseSearchWith`, `stringifySearchWith` and `createRouterConfig` (React and Vue), React's `memo`, `forwardRef` and `lazy`, Solid's `lazy`, Vue's `defineComponent` and `defineAsyncComponent`, imported from the package itself (renamed, as a namespace member such as `React.memo`, or as a member of React's default import; not re-exported through one of the app's modules); in a TanStack Start app, the builder chains of server functions, middleware, isomorphic, server-only and client-only functions (the arguments a build removes do not count; a link called on a `const` holding a builder, `base.client(…)`, changes that builder). Mark other calls with `/* @__PURE__ */`, or a function declared in the route file with `/* #__NO_SIDE_EFFECTS__ */`; an annotation frees only a call or `new` whose arguments have no side effects. The route file is split without reading the modules it imports or the bundler's options, so `#__NO_SIDE_EFFECTS__` on an imported function, `"sideEffects": false` and the bundler's list of pure functions change nothing here.
- **Exports and bundlers.** An exported binding that moved to a module of its own loads with the entry chunk, without a warning, when a module loaded with the entry imports it and the chunk shares that instance (it is needed at startup anyway). When it loads with the entry chunk otherwise, the build warns, naming the export: when a module loaded with the entry imports it through the route file while the chunk carries a copy (it ships twice: move it to its own module and import it from there in both); when another route's split code imports it through the route file and webpack or Rspack keep the route file's re-export with the entry (import it from its own module, or declare `"sideEffects": false` in package.json); when the bundler's chunk configuration (`manualChunks`, `advancedChunks`, `splitChunks`) groups its module with the entry (keep the routes directory out of such groups).
- **Positions.** Every host prints the file and one position: a Vite build at the end of the message (line and column counted from 1); the Vite dev server in its own `File:` line and code frame, mapped to the file as written; Rsbuild, Rspack and webpack in their own header (`File: ./src/routes/account.tsx:12:7`, `WARNING in ./src/routes/account.tsx 12:7`).

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
