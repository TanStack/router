# E2E Fixture: TanStack Start Module Federation Remote (Rsbuild)

Remote fixture for:

- `../module-federation-rsbuild-host`

It exposes:

- `mf_remote/message`
- `mf_remote/routes`
- `mf_remote/server-data`

## Commands

```sh
pnpm build
pnpm preview --port 3001
```

## Node SSR federation compatibility

For the node-target federation config we use:

- `library.type: 'commonjs-module'`
- `remoteType: 'script'`
- `shared.react.import: false`
- `shared.react-dom.import: false`
- SSR manifest `metaData.remoteEntry.type: 'commonjs-module'`
- SSR manifest `metaData.publicPath` points to `http://<remote-origin>/ssr/`
- SSR manifest types metadata is empty (`zip: ''`, `api: ''`)
- SSR React/ReactDOM shared metadata uses wildcard versions (`*` / `^*`).
- empty SSR shared fallback JS assets for React/ReactDOM
- exposed module JS asset entries are relative `static/js/...` paths.
- JS asset entries are expected to end in `.js`.

Web-target shared config remains standard singleton sharing (no `import: false`)
to preserve normal browser-side shared behavior.

Expected browser manifest contract for the web target:

- `metaData.remoteEntry.type: 'global'`
- `metaData.publicPath` points to `http://<remote-origin>/`
- browser manifest types metadata points to emitted types (`@mf-types.zip`, `@mf-types.d.ts`)
- browser React/ReactDOM shared metadata uses concrete non-wildcard versions.
- React/ReactDOM browser shared fallback JS assets are present.
- Browser shared JS asset entries are relative `static/js/...` paths.
- Exposed module JS asset entries are also relative `static/js/...` paths.

Federation stats contract expectations:

- SSR stats include `import: false` on React/ReactDOM shared entries.
- Browser stats do not include `import` on React/ReactDOM shared entries.
- Manifest/stats metadata contracts remain aligned across `dist` and `ssr` outputs.
- Stats shared/expose id sets remain stable (`mf_remote:react`, `mf_remote:react-dom`, and expose ids for message/routes/server-data).
- Metadata alignment includes remoteEntry name/path and build/plugin version fields.
- Shared/expose asset lists remain aligned between manifest and stats outputs.
- Types metadata (`path`/`name`) and shared/expose CSS asset lists are also expected to match between outputs.
- JSON endpoint contract also checks identity fields and remote entry/plugin metadata presence.
- JSON endpoint checks also validate path-specific metadata:
  - `/dist/*` endpoints use browser remote entry/type metadata and browser types metadata.
  - `/ssr/*` endpoints use node remote entry/type metadata and empty SSR types metadata.

Both `/dist/remoteEntry.js` and `/ssr/remoteEntry.js` are expected to serve
JavaScript payloads over HTTP with JavaScript content-types (not HTML fallbacks).

The browser types archive `/dist/@mf-types.zip` should also be retrievable as a
non-HTML payload.

This keeps React ownership on the host side in node SSR runtime and avoids
remote shared fallback chunk loading incompatibilities.

