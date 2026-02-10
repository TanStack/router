# TanStack Start - Module Federation Host (Rsbuild)

This example demonstrates a **TanStack Start host app** consuming a remote module
using:

- `@module-federation/rsbuild-plugin`
- `@module-federation/node/runtimePlugin`

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
REMOTE_PORT=3001 pnpm build
PORT=3000 pnpm start
```

3. Open `http://localhost:3000`.

The host renders the remote component during SSR and hydrates it on the client.
