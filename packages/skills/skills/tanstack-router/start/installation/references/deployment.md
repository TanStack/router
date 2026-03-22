---
name: start-deployment
---

# Deployment

Deploying TanStack Start to various hosting providers.

## Official Partners

### Cloudflare Workers

```bash
npm install -D @cloudflare/vite-plugin wrangler
```

```ts
// vite.config.ts
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

```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
}
```

```bash
npx wrangler login
npm run build && wrangler deploy
```

### Netlify

```bash
npm install -D @netlify/vite-plugin-tanstack-start
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), netlify(), viteReact()],
})
```

```bash
npx netlify deploy
```

Or add `netlify.toml`:

```toml
[build]
  command = "vite build"
  publish = "dist/client"
[dev]
  command = "vite dev"
  port = 3000
```

### Railway

Follow Nitro setup, then:

1. Push to GitHub
2. Connect repository at railway.com
3. Railway auto-detects and deploys

Features: Auto deploys, built-in databases, preview environments, automatic HTTPS.

## Nitro (Universal)

Nitro enables deployment to many providers.

```json
// package.json
{
  "nitro": "npm:nitro-nightly@latest"
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), nitro(), viteReact()],
})
```

### Vercel

Use Nitro setup above. Deploy via Vercel's one-click process.

### Node.js / Docker

Use Nitro setup. Build and run:

```bash
npm run build
node .output/server/index.mjs
```

```json
// package.json scripts
{
  "build": "vite build",
  "start": "node .output/server/index.mjs"
}
```

### Bun

Requires React 19+.

```bash
bun install react@19 react-dom@19
```

```ts
// vite.config.ts
export default defineConfig({
  plugins: [tanstackStart(), nitro({ preset: 'bun' }), viteReact()],
})
```

```bash
bun run build
bun run .output/server/index.mjs
```

For custom Bun server with asset preloading, see the [start-bun example](https://github.com/TanStack/router/tree/main/examples/react/start-bun).

### Appwrite Sites

1. Create project: `npm create @tanstack/start@latest`
2. Push to GitHub
3. Create Appwrite project at cloud.appwrite.io
4. Navigate to Sites → Create site → Connect repository
5. Verify TanStack Start detected, confirm build settings
6. Deploy

## Build Commands Summary

| Provider   | Build Command | Output Directory | Start Command                   |
| ---------- | ------------- | ---------------- | ------------------------------- |
| Cloudflare | `vite build`  | N/A              | `wrangler deploy`               |
| Netlify    | `vite build`  | `dist/client`    | `netlify deploy`                |
| Node.js    | `vite build`  | `.output`        | `node .output/server/index.mjs` |
| Bun        | `vite build`  | `.output`        | `bun .output/server/index.mjs`  |
| Vercel     | `vite build`  | Auto-detected    | Managed                         |
