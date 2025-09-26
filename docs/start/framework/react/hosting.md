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
- [`vercel`](#vercel): Deploy to Vercel
- [`railway`](#nodejs--railway--docker): Deploy to Railway
- [`nitro`](#using-nitro-v2): Deploy to a Nitro server
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

### Vercel

**⚠️ During TanStack Start 1.0 release candidate phase, we currently recommend using:**

- [@tanstack/nitro-v2-vite-plugin (Temporary Compatibility Plugin)](https://www.npmjs.com/package/@tanstack/nitro-v2-vite-plugin) - A temporary compatibility plugin for using Nitro v2 as the underlying build tool for TanStack Start.
- [Nitro v3's Vite Plugin (BETA)](https://www.npmjs.com/package/nitro-vite) - A **BETA** plugin for officially using Nitro v3 as the underlying build tool for TanStack Start.

#### Using Nitro v2

**⚠️ `@tanstack/nitro-v2-vite-plugin` is a temporary compatibility plugin for using Nitro v2 as the underlying build tool for TanStack Start. Use this plugin if you experience issues with the Nitro v3 plugin. It does not support all of Nitro v3's features and is limited in it's dev server capabilities, but should work as a safe fallback, even for production deployments for those who were using TanStack Start's alpha/beta versions.**

If you want to use this plugin with bun please make sure to use [isolated installs](https://bun.com/docs/install/isolated#using-isolated-installs).

```tsx
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart(),
    nitroV2Plugin(),
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
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
})
```

Deploy your application to Vercel using their one-click deployment process, and you're ready to go!

### Node.js / Railway / Docker

TanStack Start builds to a `node` server by default. Use the `node` command to start your application from the server from the build output files.

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart()],
})
```

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
npm install react@rc react-dom@rc
```

Ensure your `vite.config.ts` file is correct.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
})
```

Then you can run the following command to build and start your application:

```sh
bun run build
```

You're now ready to deploy your application to a Bun server. You can start your application by running:

```sh
bun run .output/server/index.mjs
```
