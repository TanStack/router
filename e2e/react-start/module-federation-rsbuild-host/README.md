# E2E Fixture: TanStack Start Module Federation Host (Rsbuild)

This fixture validates host behavior for Rsbuild + Module Federation in:

- `ssr`
- `spa`
- `prerender`

It consumes the paired remote fixture at:

- `../module-federation-rsbuild-remote`

## Commands

```sh
# SSR only
pnpm test:e2e:ssr

# SPA only
pnpm test:e2e:spa

# Prerender only
pnpm test:e2e:prerender

# Full mode matrix
pnpm test:e2e
```

## Node SSR federation requirement

Server remotes are loaded over HTTP from the remote SSR output and use:

- `remoteType: 'script'` on the host SSR plugin config.
- `shared.react/react-dom.import: false` on the remote node-target config.

The e2e suite also validates the remote SSR manifest contract:

- `metaData.remoteEntry.type === 'commonjs-module'`
- `metaData.publicPath` points to `http://<remote-origin>/ssr/`
- `metaData.types.zip === ''` and `metaData.types.api === ''`
- React/ReactDOM shared entries use wildcard metadata (`version: '*'`, `requiredVersion: '^*'`) in SSR manifest.
- React/ReactDOM shared fallback asset lists are empty in SSR manifest.
- Exposed module JS assets remain relative `static/js/...` paths.
- JS asset paths are expected to end with `.js`.

It also validates the browser manifest contract for the remote web target:

- `metaData.remoteEntry.type === 'global'`
- `metaData.publicPath` points to `http://<remote-origin>/`
- `metaData.types.zip === '@mf-types.zip'` and `metaData.types.api === '@mf-types.d.ts'`
- React/ReactDOM shared entries use concrete non-wildcard versions in browser manifest.
- React/ReactDOM shared fallback asset lists are populated in browser manifest.
- Browser shared JS asset entries remain relative `static/js/...` paths (resolved via HTTP `publicPath`).
- Exposed module JS assets remain relative `static/js/...` paths.

Federation stats contract is also verified:

- SSR stats shared entries set `import: false` for `react` and `react-dom`.
- Browser stats shared entries omit `import` and keep standard web sharing metadata.
- Manifest and stats metadata stay aligned (identity, remote entry type/publicPath, types metadata, shared/expose names).
- Stats outputs keep exact expected cardinality (`shared: 2`, `exposes: 3`) and stable ids (`mf_remote:*`).
- Alignment also covers build/plugin metadata (`buildInfo`, `pluginVersion`) and remoteEntry name/path fields.
- Shared/expose JS asset lists are aligned between manifest and stats for both browser and SSR outputs.
- Types metadata parity includes `types.path` and `types.name`, and shared/expose CSS asset lists are also aligned.
- JSON endpoint checks also validate basic payload structure (`id`, `name`, `metaData.remoteEntry.name`, `pluginVersion`).
- Endpoint payloads also preserve global metadata invariants (`metaData.globalName: 'mf_remote'`, `metaData.prefetchInterface: false`, `metaData.remoteEntry.path: ''`).
- JSON endpoint checks assert path-specific metadata values:
  - `/dist/*` endpoints return `remoteEntry.type: 'global'`, browser `types` metadata, and root publicPath.
  - `/ssr/*` endpoints return `remoteEntry.type: 'commonjs-module'`, empty SSR `types` metadata, and `/ssr/` publicPath.
- Endpoint payloads also keep consistent plugin/build metadata across all JSON endpoints (`pluginVersion`, `buildVersion`, `buildName`).
- `pluginVersion` values are also expected to be SemVer-like strings on all JSON endpoints.
- JSON endpoint payloads also enforce mode-correct shared version semantics (`react`/`react-dom` wildcard only on SSR endpoints).
- Each JSON endpoint payload also keeps `remotes: []` and exactly two shared entries (`react`, `react-dom`).
- Shared identity in each endpoint payload remains stable (`mf_remote:react`, `mf_remote:react-dom`).
- Endpoint payloads also retain expose identity/path contracts for `message`, `routes`, and `server-data`.
- Endpoint expose `requires` arrays remain empty across all JSON payloads.
- Stats endpoint payloads also retain stable expose `file` metadata (`src/message.tsx`, `src/routes.tsx`, `src/server-data.ts`).

Remote entry payloads are also validated directly over HTTP at:

- `/dist/remoteEntry.js`
- `/ssr/remoteEntry.js`

and must return JavaScript content-types (not HTML fallback pages).

The browser types artifact is also validated at:

- `/dist/@mf-types.zip`

and must be retrievable over HTTP as a non-HTML payload.

