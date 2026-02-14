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
- SSR manifest types metadata stays empty (`zip: ''`, `api: ''`)
- SSR React/ReactDOM shared metadata is wildcard (`*` / `^*`)
- SSR exposed module JS assets are emitted as relative `static/js/...` paths.

The web-target config keeps normal singleton shared config (without
`import: false`) so client-side sharing remains unchanged.

Expected browser manifest contract for web target:

- `metaData.remoteEntry.type: 'global'`
- `metaData.publicPath: 'http://<remote-origin>/'`
- browser manifest types metadata points to emitted types (`@mf-types.zip`, `@mf-types.d.ts`)
- browser React/ReactDOM shared metadata uses concrete non-wildcard versions
- React/ReactDOM shared fallback JS assets are present.
- Browser shared JS assets are emitted as relative `static/js/...` paths.
- Browser exposed module JS assets are also relative `static/js/...` paths.
- JS asset entries are expected to use `.js` suffixes.
- `/dist/remoteEntry.js` and `/ssr/remoteEntry.js` are served as JavaScript over HTTP with JavaScript content-types.
- `/dist/@mf-types.zip` is retrievable over HTTP as a non-HTML payload.
- SSR stats should show `import: false` for React/ReactDOM while browser stats keep `import` unset.
- Manifest/stats metadata is expected to stay aligned for both browser and SSR outputs.
- Stats shared/expose ids and counts are expected to remain stable (`shared: 2`, `exposes: 3`, ids prefixed with `mf_remote:`).
- Metadata alignment should also cover remoteEntry name/path and build/plugin version fields.
- Shared/expose asset lists are expected to match between manifest and stats outputs.
- Types metadata (`path`/`name`) and CSS asset list parity is expected between manifest and stats.
- JSON endpoint payloads are expected to include identity and remote entry/plugin metadata fields.
- `/dist/*` vs `/ssr/*` endpoint metadata should remain mode-correct (remoteEntry type, types metadata, publicPath).
- Build/plugin metadata should stay consistent across all federation JSON endpoints.
- Shared version metadata should remain mode-correct between browser and SSR endpoint payloads.

This keeps React shared ownership on the host side and avoids remote shared
fallback chunk loading issues in SSR node runtime.

## Run

```sh
pnpm install
pnpm build
pnpm preview --port 3001
```
