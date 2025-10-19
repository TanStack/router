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

When deploying to Cloudflare Workers, you'll need to complete a few extra steps before your users can start using your app.

1. Install `@cloudflare/vite-plugin` and `wrangler`

```bash
pnpm add -D @cloudflare/vite-plugin wrangler
```

2. Add the Cloudflare plugin to your `vite.config.ts` file

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

3. Add a `wrangler.jsonc` config file

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry"
}
```

4. Modify the scripts in your `package.json` file

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build && tsc --noEmit",
    // ============ 👇 remove this line ============
    "start": "node .output/server/index.mjs",
    // ============ 👇 add these lines ============
    "preview": "vite preview",
    "deploy": "npm run build && wrangler deploy",
    "cf-typegen": "wrangler types"
  }
}
```

5. Login with Wrangler to authenticate with your Cloudflare account.

```bash
npx wrangler login
```
or if using pnpm:
```bash
pnpm dlx wrangler login
```

7. Deploy

```bash
pnpm run deploy
```
To check current user use `wrangler whoami`.

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
- [Nitro v3's Vite Plugin (ALPHA)](https://www.npmjs.com/package/nitro) - An **ALPHA** plugin for officially using Nitro v3 as the underlying build tool for TanStack Start.

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

#### Using Nitro v3 (ALPHA)

**⚠️ The [`nitro`](https://www.npmjs.com/package/nitro) vite plugin is an official **ALPHA** plugin from the Nitro team for using Nitro v3 as the underlying build tool for TanStack Start. It is still in development and is receiving regular updates.**

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

Alternatively, you can use a custom server implementation that leverages Bun's native APIs.

We provide a reference implementation that demonstrates one approach to building a production-ready Bun server. This example uses Bun-native functions for optimal performance and includes features like intelligent asset preloading and memory management.

**This is a starting point - feel free to adapt it to your needs or simplify it for your use case.**

**What this example demonstrates:**

- Serving static assets using Bun's native file handling
- Hybrid loading strategy (preload small files, serve large files on-demand)
- Optional features like ETag support and Gzip compression
- Production-ready caching headers

**Quick Setup:**

1. Copy the [`server.ts`](https://github.com/tanstack/router/blob/main/examples/react/start-bun/server.ts) file from the example repository to your project root (or use it as inspiration for your own implementation)

2. Build your application:

   ```sh
   bun run build
   ```

3. Start the server:

   ```sh
   bun run server.ts
   ```

**Configuration (Optional):**

The reference server implementation includes several optional configuration options via environment variables. You can use these as-is, modify them, or remove features you don't need:

```sh
# Basic usage - just works out of the box
bun run server.ts

# Common configurations
PORT=8080 bun run server.ts  # Custom port
ASSET_PRELOAD_VERBOSE_LOGGING=true bun run server.ts  # See what's happening
```

**Available Environment Variables:**

| Variable                         | Description                                        | Default                                                                       |
| -------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `PORT`                           | Server port                                        | `3000`                                                                        |
| `ASSET_PRELOAD_MAX_SIZE`         | Maximum file size to preload into memory (bytes)   | `5242880` (5MB)                                                               |
| `ASSET_PRELOAD_INCLUDE_PATTERNS` | Comma-separated glob patterns for files to include | All files                                                                     |
| `ASSET_PRELOAD_EXCLUDE_PATTERNS` | Comma-separated glob patterns for files to exclude | None                                                                          |
| `ASSET_PRELOAD_VERBOSE_LOGGING`  | Enable detailed logging                            | `false`                                                                       |
| `ASSET_PRELOAD_ENABLE_ETAG`      | Enable ETag generation                             | `true`                                                                        |
| `ASSET_PRELOAD_ENABLE_GZIP`      | Enable Gzip compression                            | `true`                                                                        |
| `ASSET_PRELOAD_GZIP_MIN_SIZE`    | Minimum file size for Gzip (bytes)                 | `1024` (1KB)                                                                  |
| `ASSET_PRELOAD_GZIP_MIME_TYPES`  | MIME types eligible for Gzip                       | `text/,application/javascript,application/json,application/xml,image/svg+xml` |

<details>
<summary>Advanced configuration examples</summary>

```sh
# Optimize for minimal memory usage
ASSET_PRELOAD_MAX_SIZE=1048576 bun run server.ts

# Preload only critical assets
ASSET_PRELOAD_INCLUDE_PATTERNS="*.js,*.css" \
ASSET_PRELOAD_EXCLUDE_PATTERNS="*.map,vendor-*" \
bun run server.ts

# Disable optional features
ASSET_PRELOAD_ENABLE_ETAG=false \
ASSET_PRELOAD_ENABLE_GZIP=false \
bun run server.ts

# Custom Gzip configuration
ASSET_PRELOAD_GZIP_MIN_SIZE=2048 \
ASSET_PRELOAD_GZIP_MIME_TYPES="text/,application/javascript,application/json" \
bun run server.ts
```

</details>

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
