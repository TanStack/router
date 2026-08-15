# Bun Adapter Architecture

Bun bundler adapter for TanStack Start. Mirrors `rsbuild/`: shared core (config / planning / start-compiler / manifestBuilder / import-protection / post-build) plus a Bun-specific shell.

## Default production path

| Path | Meaning |
|------|---------|
| `dist/server/server.js` | Pure `default.fetch` (can attach to other hosts) |
| `dist/server/host.js` | **Recommended production entry**: static `../client` first, then SSR |
| `dist/client/**` | Browser assets (`/assets/...`) |

Deploy `dist/` and run `bun dist/server/host.js`.

Most official “Bun deploy” docs mean **Vite build + `nitro({ preset: 'bun' })`** (Bun as **runtime**), not Bun as the bundler. This adapter is Bun-as-bundler; the default host matches Rsbuild-style `dist` + static/`fetch`.

## API

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({ bun: { port: 3000 } })
await start.build()          // client + server Bun.build + host.js + post-build
await start.serve()          // production: dist/client static + server.js fetch
const server = await start.dev() // build + Bun.serve + src watch rebuild
```

## Cold build order

1. `prepare`: resolve root / base / outDir, `resolveStartEntryPlan`, seed virtual modules
2. Generator: write `routeTree.gen.ts` + `TSS_ROUTES_MANIFEST`
3. **Client `Bun.build`** (`target: 'browser'`)
4. Normalize outputs → `NormalizedClientBuild` → update start manifest virtual module
5. Refresh `#tanstack-start-server-fn-resolver`
6. **Server `Bun.build`** (`target: 'bun'`)
7. Write `dist/server/host.js`
8. `postBuildWithBun` (prerender / sitemap)
9. **Optional** `bun.nitro` / `bun.standalone` (see below)

## CSS / Env

Built-in `createCssAssetsPlugin`: `?url` / side-effect CSS / **CSS Modules** (`*.module.css`) / optional PostCSS / optional Tailwind. Default build copies `public/` → `dist/client`.

`loadBunEnvFiles` loads `.env*` Vite-style and injects `process.env` + `import.meta.env` defines.

## Virtual module keys

| id | Contents |
|----|----------|
| `virtual:tanstack-start-*-entry` / `#tanstack-*` | entry alias |
| `#tanstack-start-server-fn-resolver` | serverFn registry |
| `tanstack-start-manifest:v` | SSR asset manifest |
| `#tanstack-start-plugin-adapters` | serialization adapters |

## Dev / HMR

`createBunDevServer`: scoped rebuilds + **experimental** ESM middleware + HMR + React Refresh.

ESM-dev specifics (learned from real app usage):

- Pass Start **entry aliases** (`#tanstack-router-entry`, …) and **define** into the transform pipeline so package.json fake stubs and env defines resolve like production `Bun.build`
- Prefer stable `/@fs` URLs for bare imports (especially `react` / `react-dom`) so the browser dedupes a single React copy
- Strip built `/assets/*.js` link tags and scrub SSR manifest `scripts`/`preloads` so a second StartClient does not hydrate after `$_TSR.h()`
- CJS→ESM: externalize only React singletons; reject bundles that still emit `__require`; soften `import * as X` when the CJS wrapper reassigns `X`
- `import './x.css?url'` returns a URL module pointing at `/@tanstack-start/styles.css` (not raw CSS)

Granularity and stability are below Vite; some client changes may still trigger a full `Bun.build`. Dev does **not** run Nitro / standalone compile.

## Optional extras (experimental, production only)

These are **not** required for the default `host.js` path:

| Extra | Config | Output |
|-------|--------|--------|
| Nitro bridge | `bun.nitro` | `.output/**` via programmatic Nitro 3 (cannot reuse `nitro/vite`) |
| Standalone executable | `bun.standalone` | e.g. `dist/server/start` via `Bun.build({ compile })`; always embeds `dist/client` (not `.output/public`) |

They can coexist as separate outputs. Prefer default `host.js` unless you need those artifacts.

## Known limitations

- **No RSC support**
- Solid/Vue: route `autoCodeSplitting` under Bun still lacks complete framework JSX/SSR for lazy virtual modules; minimal examples should set `autoCodeSplitting: false` explicitly
- Import protection is a simplified deny/mock (full graph tracing / sourcemaps still weaker than Vite/Rsbuild)
- `bun.nitro` / `bun.standalone` are production-only and experimental

## Files

- `plugin.ts` — orchestration
- `build-pipeline.ts` — client/server `Bun.build`
- `nitro-bridge.ts` / `standalone-compile.ts` — optional extras
- `static-host.ts` / `css-assets-plugin.ts` / `post-build.ts` / `dev-server.ts` …
