---
name: start-vite-config
---

# Vite Configuration

Configuring vite.config.ts for TanStack Start.

## Basic Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
})
```

## Plugin Order

The `tanstackStart()` plugin should come before other plugins:

```ts
export default defineConfig({
  plugins: [
    tanstackStart(), // First
    viteReact(), // After
  ],
})
```

## With Deployment Plugins

### Cloudflare Workers

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
  ],
})
```

### Netlify

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), netlify(), viteReact()],
})
```

### Nitro (Vercel, Node.js, etc.)

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), nitro(), viteReact()],
})
```

### Bun

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), nitro({ preset: 'bun' }), viteReact()],
})
```

## Path Aliases

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
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

## Environment Variables

Vite exposes env variables prefixed with `VITE_`:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
  define: {
    'process.env.API_URL': JSON.stringify(process.env.API_URL),
  },
})
```

Access in code:

```ts
// Client-side (must be prefixed with VITE_)
const apiUrl = import.meta.env.VITE_API_URL

// Server-side (server functions)
const secretKey = process.env.SECRET_KEY // No prefix needed
```

## Build Output

Default output structure:

```
.output/
├── client/           # Static assets
│   └── assets/
├── server/
│   └── index.mjs     # Server entry
└── nitro.json
```
