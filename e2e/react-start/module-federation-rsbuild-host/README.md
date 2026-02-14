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
- React/ReactDOM shared fallback asset lists are empty in SSR manifest.

It also validates the browser manifest contract for the remote web target:

- `metaData.remoteEntry.type === 'global'`
- `metaData.publicPath` points to `http://<remote-origin>/`
- React/ReactDOM shared fallback asset lists are populated in browser manifest.
- Browser shared JS asset entries remain relative `static/js/...` paths (resolved via HTTP `publicPath`).

