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
- [`cloudflare-module`](#cloudflare-workers): Deploy to Cloudflare Workers
- [`node-server`](#nodejs): Deploy to a Node.js server
- [`bun`](#bun): Deploy to a Bun server
- [`docker`](#docker): Deploy using Docker
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

2. Add a `wrangler.jsonc` config file (recommended)

```jsonc
// wrangler.jsonc
{
  "name": "your-cloudflare-project-name",
  "main": "./.output/server/index.mjs",
  "compatibility_date": "2025-08-09",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": "./.output/public"
  }
}
```

Or, if you prefer TOML, add a `wrangler.toml` config file instead:

```toml
# wrangler.toml
name = "your-cloudflare-project-name"
main = "./.output/server/index.mjs"
compatibility_date = "2025-08-09"
compatibility_flags = ["nodejs_compat"]

[assets]
binding = "ASSETS"
directory = "./.output/public"
```

Deploy your application to Cloudflare Workers using their one-click deployment process, and you're ready to go!

#### Deploy to Cloudflare button

If you want others to deploy your TanStack Start app on Cloudflare Workers with a single click, you can embed Cloudflare’s Deploy button in your README or docs. Replace `<YOUR_REPO_URL>` with your public GitHub/GitLab repository URL:

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=<YOUR_REPO_URL>)
```

- Note that the Deploy button currently supports Workers applications only, not Pages applications.
- Cloudflare will read your `wrangler.jsonc` (preferred) or `wrangler.toml` to automatically provision resources and bind them to your Worker. Ensure any required bindings (for example `vars`, KV/D1/R2, Durable Objects, Secrets Store) are declared with sensible defaults so deployments succeed.
- For more, see the official docs: [Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

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

### Docker

> [!NOTE]
> The examples below use Bun. You can use Node.js instead by setting `target: 'node-server'`, choosing a Node base image, and running the server with `node .output/server/index.mjs`.

You can containerize a TanStack Start app with Bun using a small, production‑ready multi‑stage Docker build. This assumes you've configured `vite.config.ts` with `target: 'bun'` as shown above and that your app builds into `.output/`.

1. Create a `Dockerfile`

```dockerfile
# Use the official Bun image
# See tags at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.2.19 AS base
WORKDIR /usr/src/app

# Install dependencies into a temp directory to leverage Docker layer caching
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock* /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install only production dependencies
RUN mkdir -p /temp/prod
COPY package.json bun.lock* /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Copy source and build
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

ENV NODE_ENV=production
RUN bun run build --config vite.config.ts

# Final, minimal runtime image
FROM oven/bun:1.2.19 AS release
WORKDIR /usr/src/app

# Optional: curl for health checks
USER root
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/.output ./.output
COPY --from=prerelease /usr/src/app/package.json ./package.json

# Non-root runtime
USER bun

# Expose the app port inside the container
EXPOSE 5173/tcp

# Ensure the server binds to all interfaces and the expected port
ENV HOST=0.0.0.0
ENV PORT=5173

# Optional health check hitting the root route
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:5173/ || exit 1

# Start the Bun server (SSR entry emitted by TanStack Start)
ENTRYPOINT ["bun", "run", ".output/server/index.mjs"]
```

2. Add a `.dockerignore` (recommended)

```gitignore
node_modules
.git
.output
.env*
Dockerfile
docker-compose.yaml
dist
.vite
```

3. Build and run

```sh
docker build -t my-tanstack-start-app .
docker run --rm -p 8080:5173 \
  -e HOST=0.0.0.0 -e PORT=5173 \
  my-tanstack-start-app
```

Your app will be available at `http://localhost:8080`.

> [!NOTE]
> If you're also running a database or other services locally (for example Postgres on `5432`, Redis on `6379`, MySQL on `3306`), map those ports as needed (for example `-p 5432:5432`). In production, prefer internal networking between containers and avoid exposing databases publicly.

#### Optional: docker-compose.yaml

> [!NOTE]
> Use `docker-compose.yaml` when your TanStack Start app includes multiple services (for example Postgres, Redis, background workers) or you want to manage shared networks, health checks, and restart policies together. For a single-service app, a `Dockerfile` alone is usually sufficient.

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:5173"
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=5173
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5173/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    # Example: connect to Postgres in the same compose project
    # services typically communicate over the default network using service names
    # (for example DATABASE_URL=postgres://postgres:password@db:5432/postgres)
  # db:
  #   image: postgres:16
  #   environment:
  #     - POSTGRES_PASSWORD=password
  #   ports:
  #     - "5432:5432" # Only expose if you need host access; otherwise omit
```

#### Deploying on Coolify

> [!NOTE]
> The same Docker setup works on platforms like Railway, Fly.io, Render, and most container platforms that can build from a `Dockerfile` or run a pre-built image. Ensure `HOST`/`PORT` are set and map container port `5173`.

Choose one of the following based on your setup:

##### Option A — Docker Compose (recommended for multi‑service apps)
- Create a new service → Docker Compose → Build from Git.
- Connect your repo and branch; ensure the `docker-compose.yaml` path is correct (usually `./docker-compose.yaml`).
- In Build Pack, select Docker Compose (Coolify defaults to Nixpacks). Set Base Directory if your compose lives in a subfolder (for example `/apps/web`).
- Keep databases (for example Postgres on `5432`) internal; reference them via service names (for example `db:5432`).
- Set environment variables on the `app` service:
  - `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=5173`
- Network settings: set the internal application port to `5173` (Coolify defaults to `3000`). If you attach a domain, Coolify proxies via 80/443.
- Deploy. Enable auto‑deploy on pushes if desired.

##### Option B — Dockerfile (recommended for single‑service apps)
- Create a new service → Docker → Build from Git (or use a pre‑built image from a registry).
- Connect your repo and branch; verify `Dockerfile` path (usually `./Dockerfile`).
- In Build Pack, select Dockerfile (Coolify defaults to Nixpacks). Set Base Directory if your app is in a subfolder.
- Set environment variables: `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=5173`.
- Network settings: set the internal application port to `5173` (Coolify defaults to `3000`). Optionally configure a health check `/` on port `5173`.
- Deploy. Coolify will build and run the service and can auto‑deploy on new pushes.

#### Notes
- The server listens on `PORT` (default `5173`). When running in Docker, map a host port (for example `8080`) to `5173`.
- Set `HOST=0.0.0.0` so the server binds to all interfaces inside the container.
- The build outputs `.output/server/index.mjs` (server) and `.output/public` (static assets). The Dockerfile copies these from the build stage into the final image.
- Use the `oven/bun` image tag that matches your Bun version. Pinning a minor series (for example `1.2.19`) balances stability and security updates.
 - Using a database? If Postgres is part of your deployment, ensure the app can reach port `5432` (prefer internal networking). Avoid exposing databases publicly; for local access map `5432:5432`. Apply the same guidance for other services (for example Redis `6379`, MySQL `3306`).
  - If your database lives in a different Coolify stack, enable “Connect to Predefined Network” and reference the database service by its full stack-aware name. Otherwise, keep all services in the same compose stack to use the default internal network.
