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

An exported binding that only split code uses moves to a small module of its own that the chunk imports, side effects and the statements changing it included (`store.subscribe(log)` goes with `store`). An exported `let` goes there with the code assigning it (`mode = …` at the top level, or a `setMode` function), and other modules importing it from the route file still read its current value. It stays in the main bundle in these cases, and the build warns once, naming the file and what to do:

- it reads, when the module loads, a binding the route module keeps or changes: its own module would load at another time than the route module. Move it and what it reads to their own module and import it from there;
- a module loaded with the entry imports a function or constant through the route file while the chunk carries its own copy, so the build ships it twice. Move it to its own module and import it from there in both;
- another route's split code imports it through the route file, and webpack or Rspack keep the route file's re-export with the entry. Import it from its own module, or declare `"sideEffects": false` in package.json;
- it is a class, an object or a call result only split code imports, and the bundler's chunk configuration (a `manualChunks` or `cacheGroups` group that lands in the entry, Rolldown < 1.1.5) placed its module with the entry. Keep the routes directory out of such groups.

A binding the route module needs anyway (its `loader` reads it, or a module loaded with the entry imports an object from the route file) stays there without a warning: it would load with the route even without the split code.

```tsx
export const Route = createRoute('/posts')({
  // ...
  notFoundComponent: PostsNotFoundComponent,
})

// ✅ split: the chunk carries its copy, importers share one instance
export function PostsNotFoundComponent() {
  // ...
}
```

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

#### Top-level code moves with the code that uses it

Top-level code that only split code uses moves into that split chunk, side effects included: a declaration moves with the code that reads it, a statement with the bindings it uses, and unused code with what it reads. Side effects keep no order between them: a call that stays in the route file, such as `validateSearch: z.object({ … })`, does not hold back a declaration written before it.

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

Code that several split chunks use goes to one shared module they all import. It runs once, when the first of them loads:

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

#### Code that moves runs later

What moves runs when its chunk loads, no longer when the route file loads. Keep startup work that must run when the app starts in a module the app's entry imports, or use it from code the route module keeps (its `loader`, `beforeLoad`). For example:

- `Sentry.init(sentryConfig)`, where only the component reads `sentryConfig`, runs when the component's chunk loads;
- a callback registered when the module loads moves with the binding it writes: with `let flags = {}` read only by the component, `loadFlags().then((f) => { flags = f })` starts when the component's chunk loads;
- in a TanStack Start app, startup work only a server function's handler uses (`queue.process(worker)` with `queue` read by the handler) moves with the handler and runs on the first call of a server function of the file;
- a read of an object moves past a write made through what a function returned for it: after `const store = reactive(settings)` and `Object.assign(store, { dark: true })`, a `const keys = Object.keys(settings)` only the component uses moves into its chunk and sees `dark`, because the compiler does not know that `store` is `settings`.
- a call whose result is a component or loader option's value is read as keeping the function it is handed for the router to call later, as `memo`, `observer` or an app's `withAuth` do (directly, wrapped in several calls, or through `const`s): a factory that runs the function at once instead, such as `component: createIcon(() => { const n = seen.size; return () => <p>{n}</p> })`, runs it when the component's chunk loads and sees `seen` as the code that ran before left it.

#### What stays in the route file

Code stays in the route file when the route module uses it, or when a statement that stays changes or uses it. The build warns once for each binding only split code needs that stays this way, naming it, why it stays and a fix. For example, a statement writing two bindings stays with the one the route module keeps:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createSession, createTheme } from '../app'

const theme = createTheme()
const session = createSession()
if (import.meta.env.PROD) {
  theme.mode = 'dark'
  session.secure = true
}

export const Route = createFileRoute('/settings')({
  beforeLoad: () => session.check(),
  component: () => <p>{theme.mode}</p>,
})
```

```
[tanstack-router] `theme` in src/routes/settings.tsx stays in the route module because the statement on line 6, which changes it, stays there: it also changes `session`, which the route module keeps; change `session` in a statement of its own, so `theme` can load with the split `component`.
```

A value read when the module loads from state the module changes later stays too, since moving it would read the state at another time:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { loadPrefs, readTheme } from '../prefs'

const prefs = loadPrefs()
const initialTheme = prefs.theme
window.addEventListener('storage', () => {
  prefs.theme = readTheme()
})

export const Route = createFileRoute('/theme')({
  component: () => <p>{initialTheme}</p>,
})
```

```
[tanstack-router] `initialTheme` in src/routes/theme.tsx stays in the route module because it uses `prefs` when the module loads, and the module writes `prefs`; use `prefs` inside the code that needs it, or move both to their own module, so `initialTheme` can load with the split `component`.
```

A function handed to any other call may run when that call does, so a declaration such as `const save = debounce(() => prefs.theme)`, or a wrapped component used only as a JSX tag (`const Card = observer(function Card() { … })` rendered as `<Card />`), stays when that function reads such state. The warning then says it _may_ use the state, and the fix is to move both to their own module.

Unused code is never deleted: it moves with what it reads. When it reads bindings of two chunks, it puts them in one shared module, and the build says so:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createCache, createClient } from '../app'

const cache = createCache()
const client = createClient()
function debugDump() {
  return [cache, client]
}

export const Route = createFileRoute('/dashboard')({
  component: () => <p>{cache.size}</p>,
  errorComponent: () => <p>{client.status}</p>,
})
```

```
[tanstack-router] In src/routes/dashboard.tsx, unused `debugDump` (line 6) puts `cache` and `client` in one shared module the split `component` and `errorComponent` import; delete `debugDump`, so each loads with the split code that needs it.
```

Every host prints the file and one position: a Vite build at the end of the message (line and column counted from 1); the Vite dev server in its own `File:` line and code frame, mapped to the file as written; Rsbuild, Rspack and webpack in their own header (`File: ./src/routes/account.tsx:12:7`, `WARNING in ./src/routes/account.tsx 12:7`).

#### Calls without side effects

A value without side effects can be copied into each chunk that uses it, and a declaration reading one when the module loads does not stay for it. The compiler knows these calls have none when their arguments have none: TanStack Router's `getRouteApi`, `linkOptions`, `createLink`, `createRouteMask`, `lazyRouteComponent`, `lazyFn`, `retainSearchParams`, `stripSearchParams`, `parseSearchWith`, `stringifySearchWith` and `createRouterConfig` (React and Vue), React's `memo`, `forwardRef` and `lazy`, Solid's `lazy`, and Vue's `defineComponent` and `defineAsyncComponent`, imported from the package itself (a renamed import, a namespace member such as `React.memo` and a member of React's default import count; a re-export through one of the app's modules does not). In a TanStack Start app's client and server builds, the builder chains of server functions, middleware, isomorphic functions and server-only or client-only functions have none either; the arguments a build removes do not count, and a link called on a `const` that holds a builder (`base.client(…)`) changes that builder.

Mark other calls that have no side effects with `/* @__PURE__ */` before the call, or with `/* #__NO_SIDE_EFFECTS__ */` on a function declared in the route file itself. An annotation frees only a call or `new` whose arguments have no side effects. These do not change what the route file keeps, because the route file is split without reading the modules it imports or the bundler's options: `/* #__NO_SIDE_EFFECTS__ */` on a function imported from another module, `"sideEffects": false` in a package's package.json, and the bundler's list of pure functions.

#### Route callbacks that read `this` are not split

A route option written as a method or a function expression whose body reads `this` stays in the route file, and the build warns once, naming the file. The router calls these callbacks without a `this` (it is `undefined`); only code calling `Route.options.loader()` itself passes the route options, which a split chunk would not. Write such callbacks as arrow functions (or without `this`) to have them split.

#### Module state written by split code

A split option cannot write a module binding the route module also uses (`let count = 0` read by the `loader` and incremented by the component, inline or declared as `function Page() { count++ }`), nor one another split option writes: a split chunk cannot assign another module's binding. Such an option stays in the route file, and the build warns once, naming the binding. Keep that state in an object (`const state = { count: 0 }`, then `state.count++`) or in a module of its own to have it split.

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
