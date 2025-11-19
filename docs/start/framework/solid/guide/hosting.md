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
- [`appwrite-sites`](#appwrite-sites): Deploy to Appwrite Sites
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
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import viteSolid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteSolid({ ssr: true }),
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
  "main": "@tanstack/solid-start/server-entry",
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
    "deploy": "npm run build && wrangler deploy"
  }
}
```

6. Deploy

```bash
pnpm run deploy
```

Deploy your application to Cloudflare Workers using their one-click deployment process, and you're ready to go!

### Netlify ⭐ _Official Partner_

<a href="https://www.netlify.com?utm_source=tanstack" alt="Netlify Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-dark.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-light.svg" width="280">
    <img alt="Netlify logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-light.svg" width="280">
  </picture>
</a>

### Netlify

Install and add the [`@netlify/vite-plugin-tanstack-start`](https://www.npmjs.com/package/@netlify/vite-plugin-tanstack-start) plugin, which configures your build for Netlify deployment and provides full Netlify production platform emulation in local dev:

```bash
npm install --save-dev @netlify/vite-plugin-tanstack-start
# or...
pnpm add --save-dev @netlify/vite-plugin-tanstack-start
# or yarn, bun, etc.
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import netlify from '@netlify/vite-plugin-tanstack-start' // ← add this
import viteSolid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    tanstackStart(),
    netlify(), // ← add this (anywhere in the array is fine)
    viteSolid({ ssr: true }),
  ],
})
```

Finally, use [Netlify CLI](https://developers.netlify.com/cli/) to deploy your app:

```bash
npx netlify deploy
```

If this is a new Netlify project, you'll be prompted to initialize it and build settings will be automatically configured for you.

For more detailed documentation, check out the full [TanStack Start on Netlify
docs](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/).

#### Manual configuration

Alternatively, if you prefer manual configuration, you can add a `netlify.toml` file to your project root:

```toml
[build]
  command = "vite build"
  publish = "dist/client"
[dev]
  command = "vite dev"
  port = 3000
```

Or you can set the above settings directly [in the Netlify
app](https://docs.netlify.com/build/configure-builds/overview/#build-settings).

#### Other deployment methods

Netlify also supports other deployment methods, such as [continuous deployment from a git repo
hosted on GitHub, GitLab, or
others](https://docs.netlify.com/start/quickstarts/deploy-from-repository/), [starting from a
template](https://docs.netlify.com/start/quickstarts/deploy-from-template/), [deploying or
importing from an AI code generation
tool](https://docs.netlify.com/start/quickstarts/deploy-from-ai-code-generation-tool/), and
[more](https://docs.netlify.com/deploy/create-deploys/).

### Nitro

[Nitro](https://v3.nitro.build/) is an agnostic layer that allows you to deploy TanStack Start applications to [a wide range of hostings](https://v3.nitro.build/deploy).

**⚠️ The [`nitro/vite`](https://v3.nitro.build/) plugin natively integrates with Vite Environments API as the underlying build tool for TanStack Start. It is still under active development and receives regular updates. Please report any issues you encounter with reproduction so they can be investigated.**

```tsx
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import { defineConfig } from 'vite'
import { nitro } from 'nitro/vite'
import viteSolid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [tanstackStart(), nitro(), viteSolid({ ssr: true })],
  nitro: {},
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

Follow the [`Nitro`](#nitro) deployment instructions.
Depending on how you invoke the build, you might need to set the `'bun'` preset in the Nitro configuration:

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import { defineConfig } from 'vite'
import viteSolid from 'vite-plugin-solid'
import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [
    tanstackStart(),
    nitro({ preset: 'bun' })
    viteSolid({ssr: true}),
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

### Appwrite Sites

When deploying to [Appwrite Sites](https://appwrite.io/products/sites), you'll need to complete a few steps:

1. **Create a TanStack Start app** (or use an existing one)

```bash
npm create @tanstack/start@latest
```

2. **Push your project to a GitHub repository**

Create a [GitHub repository](https://github.com/new) and push your code.

3. **Create an Appwrite project**

Head to [Appwrite Cloud](https://cloud.appwrite.io) and sign up if you haven't already, then create your first project.

4. **Deploy your site**

In your Appwrite project, navigate to the **Sites** page from the sidebar. Click on the **Create site**, select **Connect a repository**, connect your GitHub account and select your repository.

1. Select the **production branch** and **root directory**
2. Verify **TanStack Start** is selected as the framework
3. Confirm the build settings:
   - **Install command:** `npm install`
   - **Build command:** `npm run build`
   - **Output directory:** `./dist` (if you're using Nitro v2 or v3, this should be `./.output`)

4. Add any required **environment variables**
5. Click **Deploy**

After successful deployment, click the **Visit site** button to see your deployed application.
