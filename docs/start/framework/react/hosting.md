---
id: hosting
title: Hosting
---

Hosting is the process of deploying your application to the internet so that users can access it. This is a critical part of any web development project, ensuring your application is available to the world. TanStack Start is built on Vite, a powerful dev/build platform that allows us to make it possible to deploy your application to any hosting provider.

## What should I use?

TanStack Start is **designed to work with any hosting provider**, so if you already have a hosting provider in mind, you can deploy your application there using the full-stack APIs provided by TanStack Start.

However, since hosting is one of the most crucial aspects of your application's performance, reliability, and scalability, we highly recommend using our Official Hosting Partner [Netlify](https://www.netlify.com?utm_source=tanstack).

## What is Netlify?

<a href="https://www.netlify.com?utm_source=tanstack" alt="Netlify Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-dark.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-light.svg" width="280">
    <img alt="Netlify logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/images/netlify-light.svg" width="280">
  </picture>
</a>

Netlify is a leading hosting platform that provides a fast, secure, and reliable environment for deploying your web applications. With Netlify, you can deploy your TanStack Start application in just a few clicks and benefit from features like a global edge network, automatic scaling, and seamless integrations with GitHub and GitLab. Netlify is designed to make your development process as smooth as possible, from local development to production deployment.

- To learn more about Netlify, visit the [Netlify website](https://www.netlify.com?utm_source=tanstack)
- To sign up, visit the [Netlify dashboard](https://www.netlify.com/signup?utm_source=tanstack)

## Deployment

> [!WARNING]
> The page is still a work in progress. We'll keep updating this page with guides on deployment to different hosting providers soon!

When a TanStack Start application is being deployed, the `target` value in the TanStack Start Vite plugin in the`vite.config.ts` file determines the deployment target. The deployment target can be set to one of the following values:

- [`netlify`](#netlify): Deploy to Netlify
- [`vercel`](#vercel): Deploy to Vercel
- [`cloudflare-workers`](#cloudflare-workers): Deploy to Cloudflare Workers
- [`railway`](#railway): Deploy to Railway
- [`node-server`](#nodejs): Deploy to a Node.js server
- [`bun`](#bun): Deploy to a Bun server
- ... and more to come!

Once you've chosen a deployment target, you can follow the deployment guidelines below to deploy your TanStack Start application to the hosting provider of your choice.

### Netlify

Set the `target` value to `'netlify'` in the TanStack Start Vite plugin in `vite.config.ts` file.

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart({ target: 'netlify' })],
})
```

Deploy your application to Netlify using their one-click deployment process, and you're ready to go!

### Vercel

Set the `target` value to `'vercel'` in the TanStack Start Vite plugin in `vite.config.ts` file.

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart({ target: 'vercel' })],
})
```

Deploy your application to Vercel using their one-click deployment process, and you're ready to go!

### Cloudflare Workers

When deploying to Cloudflare Workers, you'll need to complete a few extra steps before your users can start using your app.

1. Update `vite.config.ts`

Set the `target` value to `cloudflare-module` in your `vite.config.ts` file.

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart({ target: 'cloudflare-module' })],
})
```

2. Add a `wrangler.toml` config file

```toml
# wrangler.toml
name = "your-cloudflare-project-name"
main = "./.output/server/index.mjs"
compatibility_date = "2025-04-01"
compatibility_flags = ["nodejs_compat"]

[assets]
binding = "ASSETS"
directory = "./.output/public"
```

Deploy your application to Cloudflare Workers using their one-click deployment process, and you're ready to go!

### Railway

Railway automatically detects Build and Start commands when building and deploying to a service.

Set the `target` value to `node-server` in your `vite.config.ts` file.

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart({ target: 'node-server' })],
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

### Node.js

Set the `target` value to `node-server` in your `vite.config.ts` file.

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart({ target: 'node-server' })],
})
```

Then you can run the following command to build and start your application:

```sh
npm run build
```

You're now ready to deploy your application to a Node.js server. You can start your application by running:

```sh
node .output/server/index.mjs
```

### Bun

> [!IMPORTANT]
> Currently, the Bun specific deployment guidelines only work with React 19. If you are using React 18, please refer to the [Node.js](#nodejs) deployment guidelines.

Make sure that your `react` and `react-dom` packages are set to version 19.0.0 or higher in your `package.json` file. If not, run the following command to upgrade the packages:

```sh
npm install react@rc react-dom@rc
```

Set the `target` value to `bun` in your `vite.config.ts` file.

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart({ target: 'bun' })],
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
