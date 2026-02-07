---
name: tanstack-start-deployment
description: |
  Deployment patterns for TanStack Start.
  Use for hosting providers, production config, observability, SEO.
---

# Deployment

TanStack Start supports multiple deployment targets through Nitro and platform-specific plugins.

## Common Patterns

### Pattern 1: Cloudflare Workers

```ts
// vite.config.ts
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare(), tanstackStart()],
})
```

```jsonc
// wrangler.jsonc
{
  "name": "my-app",
  "main": ".output/server/index.mjs",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"],
}
```

```bash
npx wrangler deploy
```

### Pattern 2: Netlify

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import netlifyPlugin from '@netlify/vite-plugin-tanstack-start'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart(), netlifyPlugin()],
})
```

```bash
npx netlify deploy
```

### Pattern 3: Vercel / Railway / Node.js with Nitro

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import nitro from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    nitro({
      preset: 'node', // or 'vercel', 'netlify', etc.
    }),
    tanstackStart(),
  ],
})
```

### Pattern 4: Docker / Self-Hosted Node.js

```dockerfile
# Dockerfile
FROM node:20-slim
WORKDIR /app
COPY .output .output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

```bash
# Build and run
npm run build
docker build -t my-app .
docker run -p 3000:3000 my-app
```

### Pattern 5: Bun Runtime

```ts
// vite.config.ts
import nitro from 'nitro/vite'

export default defineConfig({
  plugins: [nitro({ preset: 'bun' }), tanstackStart()],
})
```

Or with a custom server:

```ts
// server.ts
import { Hono } from 'hono'

const app = new Hono()
// Configure routes...

export default {
  port: 3000,
  fetch: app.fetch,
}
```

```bash
bun run server.ts
```

### Pattern 6: Environment Variables in Production

```bash
# .env.production
DATABASE_URL=postgres://...
SESSION_SECRET=your-32-char-secret
API_KEY=secret-key
VITE_PUBLIC_API_URL=https://api.example.com  # Exposed to client
```

```ts
// Access in server functions
const dbUrl = process.env.DATABASE_URL

// Access in client (VITE_ prefix required)
const apiUrl = import.meta.env.VITE_PUBLIC_API_URL
```

## API Quick Reference

```ts
// vite.config.ts patterns

// Cloudflare Workers
import { cloudflare } from '@cloudflare/vite-plugin'

// Netlify
import netlifyPlugin from '@netlify/vite-plugin-tanstack-start'

// Nitro (universal - Vercel, Railway, Node, Bun, etc.)
import nitro from 'nitro/vite'
nitro({ preset: 'node' | 'vercel' | 'netlify' | 'bun' | 'deno' })

// Build output
.output/
  server/index.mjs    # Server entry point
  public/             # Static assets
```

## Detailed References

| Reference                     | When to Use                                        |
| ----------------------------- | -------------------------------------------------- |
| `references/providers.md`     | Platform-specific setup (Vercel, Netlify, CF, etc) |
| `references/configuration.md` | Production config, environment, build optimization |
| `references/observability.md` | Logging, monitoring, error tracking                |
| `references/seo.md`           | Meta tags, sitemaps, robots.txt, OpenGraph         |
