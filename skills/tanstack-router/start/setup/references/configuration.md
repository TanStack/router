# Configuration

TanStack Start configuration options.

## app.config.ts

```ts
import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  // Server configuration
  server: {
    preset: 'vercel', // Deployment target
    // 'node' | 'vercel' | 'netlify' | 'cloudflare-pages' | etc.
  },

  // Vite configuration
  vite: {
    plugins: [],
    // All Vite options available
  },

  // Router plugin options
  tsr: {
    routesDirectory: './app/routes',
    generatedRouteTree: './app/routeTree.gen.ts',
    quoteStyle: 'single',
    semicolons: false,
  },
})
```

## Server Presets

| Preset               | Target             |
| -------------------- | ------------------ |
| `node`               | Node.js server     |
| `vercel`             | Vercel             |
| `netlify`            | Netlify            |
| `cloudflare-pages`   | Cloudflare Pages   |
| `cloudflare-workers` | Cloudflare Workers |
| `deno`               | Deno               |
| `bun`                | Bun                |

## Vite Configuration

```ts
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '~': './app',
      },
    },
    define: {
      'import.meta.env.PUBLIC_API': JSON.stringify(process.env.PUBLIC_API),
    },
  },
})
```

## Router Plugin Options

```ts
export default defineConfig({
  tsr: {
    routesDirectory: './app/routes',
    generatedRouteTree: './app/routeTree.gen.ts',
    routeFileIgnorePrefix: '-',
    routeFileIgnorePattern: '*.test.tsx',
    autoCodeSplitting: true,
  },
})
```
