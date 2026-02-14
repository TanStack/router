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
- empty SSR shared fallback JS assets for React/ReactDOM

Web-target shared config remains standard singleton sharing (no `import: false`)
to preserve normal browser-side shared behavior.

This keeps React ownership on the host side in node SSR runtime and avoids
remote shared fallback chunk loading incompatibilities.

