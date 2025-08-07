---
id: hosting
title: Hosting
---

Hosting is the process of deploying your application to the internet so that users can access it. This is a critical part of any web development project, ensuring your application is available to the world. TanStack Start is built on [Nitro](https://nitro.unjs.io/), a powerful server toolkit for deploying web applications anywhere. Nitro allows TanStack Start to provide a unified API for SSR, streaming, and hydration on any hosting provider.

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

When a TanStack Start application is being deployed, the `target` value in the `vite.config.ts` file determines the deployment target. The deployment target can be set to one of the following values:

- [`netlify`](#netlify): Deploy to Netlify
- [`vercel`](#vercel): Deploy to Vercel
- [`cloudflare-pages`](#cloudflare-pages): Deploy to Cloudflare Pages
- [`node-server`](#nodejs): Deploy to a Node.js server
- [`bun`](#bun): Deploy to a Bun server
- ... and more to come!

Once you've chosen a deployment target, you can follow the deployment guidelines below to deploy your TanStack Start application to the hosting provider of your choice.

### Netlify

Set the `target` value to `netlify` in your `vite.config.ts` file.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

export default defineConfig({
  plugins: [tanstackStart({ target: 'netlify' }), viteSolid({ ssr: true })],
})
```

Deploy your application to Netlify using their one-click deployment process, and you're ready to go!

### Vercel

Deploying your TanStack Start application to Vercel is easy and straightforward. Just set the `target` value to `vercel` in your `vite.config.ts` file, and you're ready to deploy your application to Vercel.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [tanstackStart({ target: 'vercel' }), viteSolid({ ssr: true })],
})
```

Deploy you application to Vercel using their one-click deployment process, and you're ready to go!

### Cloudflare Pages

When deploying to Cloudflare Pages, you'll need to complete a few extra steps before your users can start using your app.

1. Update `vite.config.ts`

Set the `target` value to `cloudflare-pages` in your `vite.config.ts` file.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    tanstackStart({ target: 'cloudflare-module' }),
    viteSolid({ ssr: true }),
  ],
})
```

2. Add a `wrangler.toml` config file

```toml
# wrangler.toml
name = "your-cloudflare-project-name"
pages_build_output_dir = "./dist"
compatibility_flags = ["nodejs_compat"]
compatibility_date = "2024-11-13"
```

Deploy you application to Cloudflare Pages using their one-click deployment process, and you're ready to go!

### Node.js

Set the `target` value to `node-server` in your `vite.config.ts` file.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [tanstackStart({ target: 'node-server' }), viteSolid({ ssr: true })],
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

Make sure that your `solid-js` in your `package.json` file. If not, run the following command to upgrade the packages:

```sh
npm install solid-js
```

Set the `target` value to `bun` in your `vite.config.ts` file.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [tanstackStart({ target: 'bun' }), viteSolid({ ssr: true })],
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
