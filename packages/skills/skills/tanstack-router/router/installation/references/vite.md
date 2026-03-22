---
name: vite-installation
---

# Vite Installation

Setting up TanStack Router with Vite bundler.

## Installation

```bash
npm install @tanstack/react-router @tanstack/react-router-devtools
npm install -D @tanstack/router-plugin
```

## Vite Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    // IMPORTANT: router-plugin must come BEFORE react plugin
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
  ],
})
```

## Project Structure

After setup, create these files:

```
src/
├── routes/
│   ├── __root.tsx      # Root layout (note: two underscores)
│   ├── index.tsx       # Home page (/)
│   └── about.tsx       # About page (/about)
├── routeTree.gen.ts    # Auto-generated (don't edit)
└── main.tsx            # App entry point
```

## Root Route

```tsx
// src/routes/__root.tsx
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})
```

## App Entry Point

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree })

// Type registration for type-safe routing
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
```

## Configuration Options

```ts
tanstackRouter({
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: './src/routes', // Default
  generatedRouteTree: './src/routeTree.gen.ts', // Default
  routeFileIgnorePrefix: '-', // Ignore files starting with -
  quoteStyle: 'single', // 'single' | 'double'
})
```

## Ignoring Generated Files

Add to `.prettierignore`, `.eslintignore`:

```
routeTree.gen.ts
```

## VSCode Settings

```json
{
  "files.readonlyInclude": { "**/routeTree.gen.ts": true },
  "files.watcherExclude": { "**/routeTree.gen.ts": true },
  "search.exclude": { "**/routeTree.gen.ts": true }
}
```

## Legacy Plugin Migration

If using older `@tanstack/router-vite-plugin`:

```diff
- import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
+ import { tanstackRouter } from '@tanstack/router-plugin/vite'
```

## Quickstart Template

```bash
# Clone official example
git clone https://github.com/TanStack/router.git
cd router/examples/react/quickstart-file-based
npm install && npm run dev
```
