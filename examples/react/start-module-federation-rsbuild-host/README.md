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

## SSR node runtime compatibility

This host expects the paired remote's **node-target federation config** to use:

- `library.type: 'commonjs-module'`
- `remoteType: 'script'`
- `shared.react/react-dom.import: false`
- SSR manifest `metaData.remoteEntry.type: 'commonjs-module'`
- SSR manifest `metaData.publicPath: 'http://<remote-origin>/ssr/'`
- SSR manifest React/ReactDOM shared metadata uses wildcard versions (`*` / `^*`)
- SSR exposed module JS asset paths as relative `static/js/...`

For the remote web target (browser manifest), expected contract is:

- `metaData.remoteEntry.type: 'global'`
- `metaData.publicPath: 'http://<remote-origin>/'`
- browser React/ReactDOM shared metadata uses concrete non-wildcard versions
- React/ReactDOM shared fallback JS asset lists are non-empty.
- Shared JS asset entries are relative `static/js/...` paths resolved via `publicPath`.
- Exposed module JS asset entries are also relative `static/js/...` paths.

That combination keeps React shared ownership on the host and avoids SSR
runtime fallback chunk loading conflicts with `@module-federation/node`.

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
