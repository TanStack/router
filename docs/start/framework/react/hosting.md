---
id: hosting
title: Hosting
---

Hosting is the process of deploying your application to the internet so that users can access it. This is a critical part of any web development project, ensuring your application is available to the world. TanStack Start is built on Vite, a powerful dev/build platform that allows us to make it possible to deploy your application to any hosting provider.

## What should I use?

TanStack Start is **designed to work with any hosting provider**, so if you already have a hosting provider in mind, you can deploy your application there using the full-stack APIs provided by TanStack Start.

However, since hosting is one of the most crucial aspects of your application's performance, reliability, and scalability, we recommend using one of our **Official Hosting Partners**: [Cloudflare](https://www.cloudflare.com?utm_source=tanstack) or [Netlify](https://www.netlify.com?utm_source=tanstack).

## Deployment

> [!WARNING]
> The page is still a work in progress. We'll keep updating this page with guides on deployment to different hosting providers soon!

Once you've chosen a deployment target, you can follow the deployment guidelines below to deploy your TanStack Start application to the hosting provider of your choice:

- [`cloudflare-workers`](#cloudflare-workers): Deploy to Cloudflare Workers
- [`netlify`](#netlify): Deploy to Netlify
- [`nitro`](#nitro): Deploy using Nitro
- [`vercel`](#vercel): Deploy to Vercel
- [`railway`](#nodejs--railway--docker): Deploy to Railway
- [`node-server`](#nodejs--railway--docker): Deploy to a Node.js server
- [`bun`](#bun): Deploy to a Bun server
- ... and more to come!

### Cloudflare Workers ⭐ _Official Partner_

<a href="https://www.cloudflare.com?utm_source=tanstack" alt="Cloudflare Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/cloudflare-white.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/cloudflare-black.svg" width="280">
    <img alt="Cloudflare logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/cloudflare-black.svg" width="280">
  </picture>
</a>

### Cloudflare Workers

When deploying to Cloudflare Workers, you'll need to complete a few extra steps before your users can start using your app.
1. Install `@cloudflare/vite-plugin`

```bash
pnpm install @cloudflare/vite-plugin -D
```
 
2. Update `vite.config.ts`

Add the cloudflare plugin to your `vite.config.ts` file.

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
3. Install `wrangler`

```bash
pnpm add wrangler -D
```

4. Add a `wrangler.json` config file

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "vars": {
    "MY_VAR": "Hello from Cloudflare"
  }
}
```

5. Modify package.json script

```json

{
    "scripts": {
    "dev": "vite dev",
    "build": "vite build && tsc --noEmit",
    "start": "node .output/server/index.mjs",
    // ============ 👇 add this line ============
    "deploy": "wrangler deploy"
  },
}

```

6. Build and deploy

```bash
pnpm run build && pnpm run deploy
```

Deploy your application to Cloudflare Workers using their one-click deployment process, and you're ready to go!

A full TanStack Start example for Cloudflare Workers is available [here](https://github.com/TanStack/router/tree/main/examples/react/start-basic-cloudflare).

### Netlify ⭐ _Official Partner_

<a href="https://www.netlify.com?utm_source=tanstack" alt="Netlify Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-dark.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-light.svg" width="280">
    <img alt="Netlify logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-light.svg" width="280">
  </picture>
</a>

### Netlify

Install and add the [`@netlify/vite-plugin-tanstack-start`](https://www.npmjs.com/package/@netlify/vite-plugin-tanstack-start) plugin, which configures your build for Netlify deployment and provides full Netlify production platform emulation in local dev.

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

Add a `netlify.toml` file to your project root:

```toml
[build]
  command = "vite build"
  publish = "dist/client"
```

Deploy your application using their one-click deployment process, and you're ready to go!

### Nitro

[Nitro](https://nitro.build/) is an abstraction layer that allows you to deploy TanStack Start applications to [a wide range of providers](https://nitro.build/deploy).

**⚠️ During TanStack Start 1.0 release candidate phase, we currently recommend using:**

- [@tanstack/nitro-v2-vite-plugin (Temporary Compatibility Plugin)](https://www.npmjs.com/package/@tanstack/nitro-v2-vite-plugin) - A temporary compatibility plugin for using Nitro v2 as the underlying build tool for TanStack Start.
- [Nitro v3's Vite Plugin (BETA)](https://www.npmjs.com/package/nitro-nightly) - A **BETA** plugin for officially using Nitro v3 as the underlying build tool for TanStack Start.

#### Using Nitro v2

**⚠️ `@tanstack/nitro-v2-vite-plugin` is a temporary compatibility plugin for using Nitro v2 as the underlying build tool for TanStack Start. Use this plugin if you experience issues with the Nitro v3 plugin. It does not support all of Nitro v3's features and is limited in its dev server capabilities, but should work as a safe fallback, even for production deployments for those who were using TanStack Start's alpha/beta versions.**

```tsx
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'

export default defineConfig({
  plugins: [
    tanstackStart(),
    nitroV2Plugin(/* 
      // nitro config goes here, e.g.
      { preset: 'node-server' }
    */),
    viteReact(),
  ],
})
```

#### Using Nitro v3 (BETA)

**⚠️ The `nitro` vite plugin is an official **BETA** plugin from the Nitro team for using Nitro v3 as the underlying build tool for TanStack Start. It is still in development and is receiving regular updates.**

This package needs to be installed as follows:

```
 "nitro": "npm:nitro-nightly",
```

```tsx
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [
    tanstackStart(),
    nitro(/*
      // nitro config goes here, e.g.
      { config: { preset: 'node-server' } }
    */)
    viteReact(),
  ],
})
```

### Vercel

Follow the [`Nitro`](#nitro) deployment instructions.
Deploy your application to Vercel using their one-click deployment process, and you're ready to go!

### Node.js / Railway / Docker

Follow the [`Nitro`](#nitro) deployment instructions. Use the `node` command to start your application from the server from the build output files.

Ensure `build` and `start` npm scripts are present in your `package.json` file:

```json
    "build": "vite build",
    "start": "node .output/server/index.mjs"
```

Then you can run the following command to build your application:

```sh
npm run build
```

You can start your application by running:

```sh
npm run start
```

### Bun

> [!IMPORTANT]
> Currently, the Bun specific deployment guidelines only work with React 19. If you are using React 18, please refer to the [Node.js](#nodejs--railway--docker) deployment guidelines.

Make sure that your `react` and `react-dom` packages are set to version 19.0.0 or higher in your `package.json` file. If not, run the following command to upgrade the packages:

```sh
bun install react@19 react-dom@19
```

Follow the [`Nitro`](#nitro) deployment instructions.
Depending on how you invoke the build, you might need to set the `'bun'` preset in the Nitro configuration:

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
// alternatively: import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [
    tanstackStart(),
    nitroV2Plugin({ preset: 'bun' })
    // alternatively: nitro( { config: { preset: 'bun' }} ),
    viteReact(),
  ],
})
```

#### Production Server with Bun

Alternatively, you can use a custom server implementation.

We've created an optimized production server that provides intelligent static asset loading with configurable memory management.

**Features:**

- **Hybrid loading strategy**: Small files (<5MB by default) are preloaded into memory, large files are served on-demand
- **Configurable file filtering**: Use include/exclude patterns to control which files are preloaded
- **Production-ready caching headers**: Automatic optimization for static assets
- **Memory-efficient**: Smart memory management prevents excessive RAM usage

**Quick Setup:**

1. Copy the [`server.ts`](https://github.com/tanstack/router/blob/main/examples/react/start-bun/server.ts) file from the example in this repository to your project root

2. Build your application:

   ```sh
   bun run build
   ```

3. Start the server:

   ```sh
   bun run server.ts
   ```

**Configuration:**

The server can be configured using environment variables:

```sh
# Basic usage
bun run server.ts

# Custom port
PORT=8080 bun run server.ts

# Optimize for minimal memory usage (1MB preload limit)
STATIC_PRELOAD_MAX_BYTES=1048576 bun run server.ts

# Preload only critical assets
STATIC_PRELOAD_INCLUDE="*.js,*.css" \
STATIC_PRELOAD_EXCLUDE="*.map,vendor-*" \
bun run server.ts

# Debug mode with verbose logging
STATIC_PRELOAD_VERBOSE=true bun run server.ts
```

**Environment Variables:**

- `PORT`: Server port (default: 3000)
- `STATIC_PRELOAD_MAX_BYTES`: Maximum file size to preload in bytes (default: 5242880 = 5MB)
- `STATIC_PRELOAD_INCLUDE`: Comma-separated glob patterns for files to include
- `STATIC_PRELOAD_EXCLUDE`: Comma-separated glob patterns for files to exclude
- `STATIC_PRELOAD_VERBOSE`: Enable detailed logging (set to "true")

**Example Output:**

```txt
📦 Loading static assets from ./dist/client...
   Max preload size: 5.00 MB

📁 Preloaded into memory:
   /assets/index-a1b2c3d4.js           45.23 kB │ gzip:  15.83 kB
   /assets/index-e5f6g7h8.css           12.45 kB │ gzip:   4.36 kB

💾 Served on-demand:
   /assets/vendor-i9j0k1l2.js          245.67 kB │ gzip:  86.98 kB

✅ Preloaded 2 files (57.68 KB) into memory
🚀 Server running at http://localhost:3000
```

For a complete working example, check out the [TanStack Start + Bun example](https://github.com/TanStack/router/tree/main/examples/react/start-bun) in this repository.
