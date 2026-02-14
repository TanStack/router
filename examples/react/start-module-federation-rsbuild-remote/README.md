# TanStack Start - Module Federation Remote (Rsbuild)

This example is the **remote app** used by the host example:

- `../start-module-federation-rsbuild-host`

It exposes:

- `mf_remote/message`
- `mf_remote/routes` (dynamic route registrations)
- `mf_remote/server-data` (server-side federated data helper)

via `@module-federation/rsbuild-plugin`, and serves chunks over HTTP.

## SSR node runtime note

For node-target federation in this setup we use:

- `library.type: 'commonjs-module'`
- `remoteType: 'script'`
- `shared.react/react-dom.import: false` in the node-target config
- SSR manifest `metaData.remoteEntry.type: 'commonjs-module'`
- SSR manifest `metaData.publicPath: 'http://<remote-origin>/ssr/'`

The web-target config keeps normal singleton shared config (without
`import: false`) so client-side sharing remains unchanged.

Expected browser manifest contract for web target:

- `metaData.remoteEntry.type: 'global'`
- `metaData.publicPath: 'http://<remote-origin>/'`
- React/ReactDOM shared fallback JS assets are present.

This keeps React shared ownership on the host side and avoids remote shared
fallback chunk loading issues in SSR node runtime.

## Run

```sh
pnpm install
pnpm build
pnpm preview --port 3001
```
