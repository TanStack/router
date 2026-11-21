---
name: vue-start
description: >-
  Vue bindings for TanStack Start: useServerFn hook, tanstackStart
  Vite plugin, StartClient, StartServer, Vue-specific setup,
  re-exports from @tanstack/start-client-core. Full project setup
  with Vue.
metadata:
  type: framework
  library: tanstack-start
  library_version: '1.166.2'
  framework: vue
requires:
  - start-core
sources:
  - TanStack/router:packages/vue-start/src
---

# Vue Start (`@tanstack/vue-start`)

This skill builds on start-core. Read `@tanstack/start-client-core#start-core` first for foundational concepts.

This skill covers the Vue-specific bindings, setup, and patterns for TanStack Start.

> **CRITICAL**: All code is ISOMORPHIC by default. Loaders run on BOTH server and client. Use `createServerFn` for server-only logic.

> **CRITICAL**: Do not confuse `@tanstack/vue-start` with Nuxt. They are completely different frameworks with different APIs.

> **CRITICAL**: Types are FULLY INFERRED. Never cast, never annotate inferred values.

## Package API Surface

`@tanstack/vue-start` re-exports everything from `@tanstack/start-client-core` plus:

- `useServerFn` — Vue composable for calling server functions from components

All core APIs (`createServerFn`, `createMiddleware`, `createStart`, `createIsomorphicFn`, `createServerOnlyFn`, `createClientOnlyFn`) are available from `@tanstack/vue-start`.

Server utilities (`getRequest`, `getRequestHeader`, `setResponseHeader`, `setCookie`, `getCookie`) are imported from `@tanstack/vue-start/server`.

## Full Project Setup

### 1. Install Dependencies

```bash
npm i @tanstack/vue-start @tanstack/vue-router vue
npm i -D vite @vitejs/plugin-vue @vitejs/plugin-vue-jsx typescript
```

### 2. package.json

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs"
  }
}
```

### 3. tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "vue",
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "target": "ES2022",
    "skipLibCheck": true,
    "strictNullChecks": true
  }
}
```

### 4. vite.config.ts

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/vue-start/plugin/vite'
import vuePlugin from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

export default defineConfig({
  plugins: [
    tanstackStart(),
    vuePlugin(),
    vueJsx(), // Required for JSX/TSX route files
  ],
})
```

### 5. Router Factory (src/router.tsx)

```tsx
import { createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  })
  return router
}
```

### 6. Root Route (src/routes/\_\_root.tsx)

```tsx
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Html,
  Body,
} from '@tanstack/vue-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My TanStack Start App' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <Html>
      <head>
        <HeadContent />
      </head>
      <Body>
        <Outlet />
        <Scripts />
      </Body>
    </Html>
  )
}
```

### 7. Index Route (src/routes/index.tsx)

```tsx
import { createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import { defineComponent } from 'vue'

const getGreeting = createServerFn({ method: 'GET' }).handler(async () => {
  return 'Hello from TanStack Start!'
})

const HomePage = defineComponent({
  setup() {
    const greeting = Route.useLoaderData()
    return () => <h1>{greeting.value}</h1>
  },
})

export const Route = createFileRoute('/')({
  loader: () => getGreeting(),
  component: HomePage,
})
```

## useServerFn Composable

Use `useServerFn` to call server functions from Vue components with automatic redirect handling:

```tsx
import { createServerFn, useServerFn } from '@tanstack/vue-start'
import { ref } from 'vue'

const updatePost = createServerFn({ method: 'POST' })
  .validator((data: { id: string; title: string }) => data)
  .handler(async ({ data }) => {
    await db.posts.update(data.id, { title: data.title })
    return { success: true }
  })

// In a component setup:
const updatePostFn = useServerFn(updatePost)
const title = ref('')

async function handleSubmit(postId: string) {
  await updatePostFn({ data: { id: postId, title: title.value } })
}
```

Unlike the React version, `useServerFn` does NOT wrap the returned function in `useCallback` — Vue's `setup()` runs once per component instance, so no memoization is needed.

## Vue-Specific Components

All routing components from `@tanstack/vue-router` work in Start:

- `<Outlet>` — renders matched child route
- `<Link>` — type-safe navigation with scoped slots
- `<Navigate>` — declarative redirect
- `<HeadContent>` — renders head tags (must be in `<head>`)
- `<Scripts>` — renders body scripts (must be in `<body>`)
- `<Await>` — renders deferred data with Vue `<Suspense>`
- `<ClientOnly>` — renders children only after `onMounted`
- `<CatchBoundary>` — error boundary via `onErrorCaptured`
- `<Html>` — SSR shell `<html>` wrapper
- `<Body>` — SSR shell `<body>` wrapper

## Composables Reference

All composables from `@tanstack/vue-router` work in Start. Most return `Ref<T>` — access via `.value`:

- `useRouter()` — router instance (NOT a Ref)
- `useRouterState()` — `Ref<T>`, subscribe to router state
- `useNavigate()` — navigation function (NOT a Ref)
- `useSearch({ from })` — `Ref<T>`, validated search params
- `useParams({ from })` — `Ref<T>`, path params
- `useLoaderData({ from })` — `Ref<T>`, loader data
- `useMatch({ from })` — `Ref<T>`, full route match
- `useRouteContext({ from })` — `Ref<T>`, route context
- `Route.useLoaderData()` — `Ref<T>`, typed loader data (preferred in route files)
- `Route.useSearch()` — `Ref<T>`, typed search params (preferred in route files)

## Common Mistakes

### 1. CRITICAL: Importing from wrong package

```tsx
// WRONG — this is the SPA router, NOT Start
import { createServerFn } from '@tanstack/vue-router'

// CORRECT — server functions come from vue-start
import { createServerFn } from '@tanstack/vue-start'

// CORRECT — routing APIs come from vue-router
import { createFileRoute, Link } from '@tanstack/vue-router'
```

### 2. CRITICAL: Forgetting .value in script blocks

Most composables return `Ref<T>`. In `<script>`, access via `.value`.

```tsx
// WRONG
const data = Route.useLoaderData()
console.log(data.message) // undefined!

// CORRECT
const data = Route.useLoaderData()
console.log(data.value.message)
```

### 3. HIGH: Missing Scripts component

Without `<Scripts />` in the root route's `<body>`, client JavaScript doesn't load and the app won't hydrate.

### 4. HIGH: Using Html/Body incorrectly

Vue Start uses `<Html>` and `<Body>` components for the SSR document shell. On the server they render `<html>` and `<body>` tags; on the client they handle hydration properly.

```tsx
// WRONG — plain HTML tags can cause hydration mismatches
function RootComponent() {
  return (
    <html>
      <body>
        <Outlet />
      </body>
    </html>
  )
}

// CORRECT — use Html and Body components
function RootComponent() {
  return (
    <Html>
      <head>
        <HeadContent />
      </head>
      <Body>
        <Outlet />
        <Scripts />
      </Body>
    </Html>
  )
}
```

### 5. HIGH: Server functions in a `<script setup>` block

A `<script setup>` block runs once per component instance, not once when the module loads, so the compiler refuses a server function defined there, in every mode: the component does not compile and the error says to define it at the top level. Define server functions, builders and middleware in a plain `<script lang="ts">` block of the component or in a separate `.ts` module, and call them from `<script setup>`.

On the dev server (Vite and Rsbuild), and in builds with Vue's devtools on (Vite: `vue({ features: { prodDevtools: true } })`, `define: { __VUE_PROD_DEVTOOLS__: true }` or `NODE_ENV=development vite build`; Rsbuild: `NODE_ENV=development`), Vue also hands every binding a `<script setup>` block declares to its template, and in a JavaScript block every import too. A JavaScript `<script setup>` block importing a builder or factory, or a local holding an open builder, is refused there too.

```vue
<!-- WRONG: a server function defined in <script setup> -->
<script setup lang="ts">
import { createServerFn } from '@tanstack/vue-start'
const getGreeting = createServerFn().handler(async () => 'Hello')
</script>

<!-- WRONG in development: a JavaScript block importing a factory -->
<script setup>
import { createServerFn } from '@tanstack/vue-start'
</script>

<!-- WRONG in development: a local holding an open builder -->
<script setup lang="ts">
import { createMiddleware } from '@tanstack/vue-start'
const logged = createMiddleware({ type: 'function' })
</script>
```

```vue
<!-- CORRECT: server functions and middleware in a plain <script> block,
     called from <script setup> -->
<script lang="ts">
import { createMiddleware, createServerFn } from '@tanstack/vue-start'
const logged = createMiddleware({ type: 'function' }).server(({ next }) =>
  next(),
)
export const getGreeting = createServerFn()
  .middleware([logged])
  .handler(async () => 'Hello')
</script>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
const greeting = ref('')
onMounted(async () => {
  greeting.value = await getGreeting()
})
</script>
```

```ts
// CORRECT: server functions in a separate module (src/greeting.ts) ...
import { createServerFn } from '@tanstack/vue-start'

export const getGreeting = createServerFn().handler(async () => 'Hello')
```

```vue
<!-- ... imported by the component -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getGreeting } from '../greeting'
const greeting = ref('')
onMounted(async () => {
  greeting.value = await getGreeting()
})
</script>
```

Never attach server code in the template (`{{ base.handler(...) }}`): it is refused in every mode.

## Cross-References

- `@tanstack/start-client-core#start-core` — core Start concepts
- `@tanstack/router-core#router-core` — routing fundamentals
- `@tanstack/vue-router#vue-router` — Vue Router composables and components
