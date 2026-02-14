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
- SSR manifest types metadata empty (`zip: ''`, `api: ''`)
- SSR manifest React/ReactDOM shared metadata uses wildcard versions (`*` / `^*`)
- SSR exposed module JS asset paths as relative `static/js/...`

For the remote web target (browser manifest), expected contract is:

- `metaData.remoteEntry.type: 'global'`
- `metaData.publicPath: 'http://<remote-origin>/'`
- browser manifest types metadata points to emitted types (`@mf-types.zip`, `@mf-types.d.ts`)
- browser React/ReactDOM shared metadata uses concrete non-wildcard versions
- React/ReactDOM shared fallback JS asset lists are non-empty.
- Shared JS asset entries are relative `static/js/...` paths resolved via `publicPath`.
- Exposed module JS asset entries are also relative `static/js/...` paths.
- JS asset entries are expected to use `.js` suffixes.
- `/dist/remoteEntry.js` and `/ssr/remoteEntry.js` should serve JavaScript over HTTP with JavaScript content-types.
- `/dist/@mf-types.zip` should be retrievable over HTTP as a non-HTML payload.
- SSR stats shared entries should set `import: false` for React/ReactDOM; browser stats should omit `import`.
- Manifest and stats metadata should remain aligned across browser and SSR outputs.
- Stats entry ids and cardinality should remain stable (`shared: 2`, `exposes: 3`, ids under `mf_remote:*`).
- Metadata parity should include remoteEntry name/path plus build/plugin version fields.
- Shared/expose asset lists should also stay aligned between manifest and stats outputs.
- Types metadata (`path`/`name`) and CSS asset lists are expected to stay aligned as well.
- JSON endpoint validation should include identity fields and remote entry/plugin metadata presence.
- Endpoint payloads should keep identity metadata stable (`metaData.name: mf_remote`, `metaData.type: app`, `buildInfo.buildVersion: local`).
- Endpoint payloads should keep global metadata invariants (`globalName: mf_remote`, `prefetchInterface: false`, `remoteEntry.path: ''`).
- `/dist/*` and `/ssr/*` JSON endpoints should each report their expected remoteEntry type/types metadata/publicPath values.
- `types.path` and `types.name` should remain empty strings (`''`) across browser and SSR endpoint payloads.
- Build/plugin metadata fields are expected to remain consistent across all federation JSON endpoints.
- `pluginVersion` values should also remain SemVer-like across all federation JSON endpoints.
- Shared version metadata should stay mode-correct across endpoints (browser concrete versions, SSR wildcard versions).
- JSON endpoint payloads should keep `remotes` empty and include only `react`/`react-dom` shared entries.
- Shared endpoint ids should remain stable as `mf_remote:react` and `mf_remote:react-dom`.
- Expose ids/paths in endpoint payloads should remain stable for `message`, `routes`, and `server-data`.
- Stats endpoint expose `requires` arrays should remain empty; manifest endpoint payloads should omit `requires`.
- Stats endpoint payloads should also keep stable expose `file` values (`src/message.tsx`, `src/routes.tsx`, `src/server-data.ts`).

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
