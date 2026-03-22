---
name: tanstack-start-setup
description: |
  TanStack Start project setup and configuration.
  Use for project structure, entry points, configuration, and initial setup.
---

# Setup

TanStack Start uses a specific project structure with client and server entry points for full-stack React applications.

## Common Patterns

### Project Structure

```
my-app/
├── app/
│   ├── routes/
│   │   ├── __root.tsx      # Root layout
│   │   ├── index.tsx       # Home page (/)
│   │   └── posts.tsx       # /posts page
│   ├── client.tsx          # Client entry point
│   ├── router.tsx          # Router configuration
│   ├── ssr.tsx             # Server entry point
│   └── routeTree.gen.ts    # Auto-generated routes
├── vite.config.ts          # Vite + Start plugin
├── package.json
└── tsconfig.json
```

### Vite Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    tanstackStart(), // Must come before react plugin
    viteReact(),
  ],
})
```

### Root Route (Required)

```tsx
// app/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Meta, Scripts, Body, Head, Html } from '@tanstack/react-start'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <Html>
      <Head>
        <Meta />
      </Head>
      <Body>
        <Outlet />
        <Scripts />
      </Body>
    </Html>
  )
}
```

### Router Configuration

```tsx
// app/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
```

### Client Entry Point

```tsx
// app/client.tsx
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { createAppRouter } from './router'

const router = createAppRouter()

hydrateRoot(document, <StartClient router={router} />)
```

### Server Entry Point

```tsx
// app/ssr.tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createAppRouter } from './router'

export default createStartHandler({
  createRouter: createAppRouter,
})(defaultStreamHandler)
```

### Path Aliases

```ts
// vite.config.ts
import { resolve } from 'path'

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
    },
  },
})
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./app/*"]
    }
  }
}
```

### Adding Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

```ts
// tailwind.config.ts
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

```css
/* app/styles.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```tsx
// app/routes/__root.tsx
import '../styles.css'
```

## API Quick Reference

```tsx
// Vite plugin
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

// Start components for root route
import { Html, Head, Body, Meta, Scripts, Links } from '@tanstack/react-start'

// Client entry
import { StartClient } from '@tanstack/react-start/client'

// Server entry
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
```

## Detailed References

| Reference                      | When to Use                                    |
| ------------------------------ | ---------------------------------------------- |
| `references/project-setup.md`  | Initial project creation, dependencies         |
| `references/configuration.md`  | vite.config.ts options, plugin settings        |
| `references/entry-points.md`   | Client/server entry customization, SSR handler |
| `references/file-structure.md` | Directory organization, conventions            |
| `references/path-aliases.md`   | Import aliases, tsconfig paths                 |
| `references/routing.md`        | File-based routing in Start context            |
| `references/tailwind.md`       | Tailwind CSS integration                       |
