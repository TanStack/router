---
id: hosting
title: Hosting
---

Hosting is the process of deploying your application to the internet so that users can access it. This is a critical part of any web development project, ensuring your application is available to the world. TanStack Start is built on [Nitro](https://nitro.unjs.io/), a powerful server toolkit for deploying web applications anywhere. Nitro allows TanStack Start to provide a unified API for SSR, streaming, and hydration on any hosting provider.

## What should I use?

TanStack Start is **designed to work with any hosting provider**, so if you already have a hosting provider in mind, you can deploy your application there using the full-stack APIs provided by TanStack Start.

However, since hosting is one of the most crucial aspects of your application's performance, reliability, and scalability, we highly recommend using [Vercel](https://vercel.com?utm_source=tanstack) for the best possible hosting experience.

## What is Vercel?

<a href="https://vercel.com?utm_source=tanstack" alt="Vercel Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/vercel-dark.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/vercel-light.svg" width="280">
    <img alt="Convex logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/vercel-light.svg" width="280">
  </picture>
</a>

Vercel is a leading hosting platform that provides a fast, secure, and reliable environment for deploying your web applications. With Vercel, you can deploy your TanStack Start application in just a few clicks and benefit from features like a global edge network, automatic scaling, and seamless integrations with GitHub and GitLab. Vercel is designed to make your development process as smooth as possible, from local development to production deployment.

- To learn more about Vercel, visit the [Vercel website](https://vercel.com?utm_source=tanstack)
- To sign up, visit the [Vercel dashboard](https://vercel.com/signup?utm_source=tanstack)

## Deployment

> [!WARNING]
> The page is still a work in progress. We'll keep updating this page with guides on deployment to different hosting providers soon!

When a TanStack Start application is being deployed, the `deployment.preset` value in the `app.config.ts` file determines the deployment target. The deployment target can be set to one of the following values:

- [`vercel`](#vercel): Deploy to Vercel
- [`cloudflare-pages`](#cloudflare-pages): Deploy to Cloudflare Pages
- [`netlify`](#netlify): Deploy to Netlify
- [`node-server`](#nodejs): Deploy to a Node.js server
- [`bun`](#bun): Deploy to a Bun server
- ... and more to come!

Once you've chosen a deployment target, you can follow the deployment guidelines below to deploy your TanStack Start application to the hosting provider of your choice.

If you don't want to specify your deployment target in the `app.config.ts` file, you can use the `--preset` flag with the `build` command to specify the deployment target when building the application:

```sh
npm run build --preset vercel
```

### Vercel

Deploying your TanStack Start application to Vercel is easy and straightforward. Just set the `deployment.preset` value to `vercel` in your `app.config.ts` file, and you're ready to deploy your application to Vercel.

```ts
// app.config.ts
import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  deployment: {
    preset: 'vercel',
  },
})
```

Deploy you application to Vercel and you're ready to go!

### Cloudflare Pages

Deploying your TanStack Start application to Cloudflare Pages is easy and straightforward. Just set the `deployment.preset` value to `cf-pages` in your `app.config.ts` file, and you're ready to deploy your application to Cloudflare Pages.

```ts
// app.config.ts
import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  deployment: {
    preset: 'cloudflare-pages',
  },
})
```

Deploy you application to Cloudflare Pages and you're ready to go!

### Netlify

Deploying your TanStack Start application to Vercel is easy and straightforward. Just set the `deployment.preset` value to `netlify` in your `app.config.ts` file, and you're ready to deploy your application to Vercel.

```ts
// app.config.ts
import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  deployment: {
    preset: 'netlify',
  },
})
```

Deploy you application to Netlify and you're ready to go!

### Node.js

Deploying your TanStack Start application to a Bun server is easy and straightforward. Just set the `deployment.preset` value to `node-server` in your `app.config.ts` file, and you're ready to deploy your application to a Node.js server.

```ts
// app.config.ts
import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  deployment: {
    preset: 'node-server',
  },
})
```

Then you can run the following command to build and start your application:

```sh
npm run build
```

Once the build is complete, you can start your application by running:

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

Set the `deployment.preset` value to `bun` in your `app.config.ts` file, and you're ready to deploy your application to a Node.js server.

```ts
// app.config.ts
import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  deployment: {
    preset: 'bun',
  },
})
```

Then you can run the following command to build and start your application:

```sh
bun run build
```

Once the build is complete, you can start your application by running:

```sh
bun run .output/server/index.mjs
```
