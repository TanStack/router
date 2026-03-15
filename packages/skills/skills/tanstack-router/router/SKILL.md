---
name: tanstack-router-core
description: |
  Core TanStack Router patterns for client-side routing.
  Use for route definitions, navigation, data loading, search params, and type safety.
---

# TanStack Router

Type-safe routing for React and Solid applications with first-class search param support, built-in caching, and automatic code splitting.

## Routing Table

| Topic             | Directory        | When to Use                                                                                  |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| **Installation**  | `installation/`  | Setting up TanStack Router with Vite, Webpack, Rspack, ESBuild, CLI, migration               |
| **Routing**       | `routing/`       | Route definitions, file-based vs code-based routing, route trees, matching, path params      |
| **Navigation**    | `navigation/`    | Links, programmatic navigation, navigation blocking, route masking, URL rewrites             |
| **Data Loading**  | `data-loading/`  | Loaders, deferred loading, preloading, mutations, external data integration (TanStack Query) |
| **Search Params** | `search-params/` | Type-safe search params, validation, serialization, default values                           |
| **Auth & Errors** | `auth-errors/`   | Protected routes, redirects, not-found handling, error boundaries                            |
| **Integrations**  | `integrations/`  | UI frameworks (Chakra, MUI, Shadcn), testing, animations, React Query, state management      |
| **Advanced**      | `advanced/`      | Code splitting, SSR basics, router context, render optimizations, scroll restoration         |
| **Type Safety**   | `type-safety/`   | Type inference, utilities, strict typing patterns                                            |

## Core Setup

```tsx
// app/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

```tsx
// app/main.tsx
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

function App() {
  return <RouterProvider router={router} />
}
```

## File-Based Routing (Quick Reference)

| File Pattern            | Route Path   | Purpose                    |
| ----------------------- | ------------ | -------------------------- |
| `routes/__root.tsx`     | -            | Root layout, always active |
| `routes/index.tsx`      | `/`          | Home page                  |
| `routes/about.tsx`      | `/about`     | Static route               |
| `routes/posts/`         | `/posts`     | Directory = path segment   |
| `routes/posts/$id.tsx`  | `/posts/:id` | Dynamic param              |
| `routes/posts_.$id.tsx` | `/posts/:id` | Flat file dynamic param    |
| `routes/_layout.tsx`    | -            | Pathless layout wrapper    |
| `routes/(group)/`       | -            | Route group (no URL)       |
