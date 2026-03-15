---
name: start-project-setup
---

# Project Setup

Manual TanStack Start project configuration.

## Installation

```bash
npm install @tanstack/react-router @tanstack/react-start
npm install -D @tanstack/router-plugin vite @vitejs/plugin-react typescript
```

## Project Structure

```
project/
├── app/
│   ├── routes/
│   │   ├── __root.tsx      # Root layout (required)
│   │   ├── index.tsx       # Home page (/)
│   │   └── about.tsx       # /about page
│   ├── client.tsx          # Client entry point
│   ├── router.tsx          # Router configuration
│   ├── ssr.tsx             # SSR entry point
│   └── routeTree.gen.ts    # Auto-generated (don't edit)
├── vite.config.ts
├── app.config.ts           # Optional: Start configuration
├── package.json
└── tsconfig.json
```

## Root Route

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

## Router Configuration

```tsx
// app/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  return createRouter({ routeTree })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
```

## Client Entry Point

```tsx
// app/client.tsx
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { createAppRouter } from './router'

const router = createAppRouter()

hydrateRoot(document, <StartClient router={router} />)
```

## SSR Entry Point

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

## Index Route

```tsx
// app/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <h1>Welcome to TanStack Start</h1>
}
```

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs"
  }
}
```

## TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "paths": {
      "~/*": ["./app/*"]
    }
  },
  "include": ["app/**/*", "vite.config.ts"]
}
```

## Ignoring Generated Files

Add to `.gitignore`:

```
.output/
routeTree.gen.ts
```

Add to `.prettierignore` and `.eslintignore`:

```
routeTree.gen.ts
```
