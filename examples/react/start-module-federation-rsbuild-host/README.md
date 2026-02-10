# TanStack Start - Module Federation Host (Rsbuild)

This example demonstrates a **TanStack Start host app** consuming a remote module
using:

- `@module-federation/rsbuild-plugin`
- `@module-federation/node/runtimePlugin`

It also demonstrates:

- Dynamic route registration from a remote module (Option B)
- Selective SSR (`ssr: false`) on a federated route
- Federated server route and server function handlers
- Start mode matrix via `HOST_MODE`: `ssr`, `spa`, `prerender`

## Run with the remote app

1. Start the remote app first:

```sh
cd ../start-module-federation-rsbuild-remote
pnpm install
pnpm build
pnpm preview --port 3001
```

2. In another terminal, start the host app:

```sh
pnpm install
HOST_MODE=ssr REMOTE_PORT=3001 pnpm build
PORT=3000 pnpm start
```

3. Open `http://localhost:3000`.

The host renders the remote component during SSR and hydrates it on the client.

## Try other Start modes

```sh
# SPA mode
HOST_MODE=spa REMOTE_PORT=3001 pnpm build
PORT=3000 pnpm start

# Static prerender mode
HOST_MODE=prerender REMOTE_PORT=3001 pnpm build
PORT=3000 pnpm start
```
