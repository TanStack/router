# Client Navigation Benchmarks

Cross-framework client-side navigation benchmarks for:

- `@tanstack/react-router`
- `@tanstack/solid-router`
- `@tanstack/vue-router`

## Layout

- `react/` - React benchmark + Vitest config
- `solid/` - Solid benchmark + Vitest config
- `vue/` - Vue benchmark + Vitest config
- `scenarios/<scenario>/<framework>/` - isolated scenario apps added after the shared harness lands
- `bench-utils.ts` - stable tinybench options and deterministic seeded helpers
- `benchmark.ts` - shared workload contract for scenario bench files
- `lifecycle.ts` - shared mount/action/wait/teardown harness for scenario setup files

## Scenario Contract

The top-level `react/`, `solid/`, and `vue/` apps remain the baseline benchmarks
for CodSpeed continuity. New feature coverage should live under
`scenarios/<scenario>/<framework>/` and use stable project names of the form
`@benchmarks/client-nav-<scenario>-<framework>`.

Each scenario app exports `mountTestApp(container)` and returns
`{ router, unmount }`; `unmount` should be safe to call twice. Scenario setup
files import the built app from `./dist/app.js` with
`await import(/* @vite-ignore */ appModulePath)` and can use
`createClientNavLifecycle` from `#client-nav/lifecycle` for idempotent mount,
navigation waits, cleanup registration, and teardown.

Scenario `vite.config.ts` files should set their root to the framework directory,
build library mode from `./src/app.tsx`, and write `./dist/app.js`. Scenario
projects should expose `build:client`, `build:client:flame`, `test:flame`, and
`test:types:client` targets; flame targets should set `parallelism: false`.

Scenario `speed.bench.ts` files must run `await workload.sanity()` before
`describe(...)`, then register both Vitest `beforeAll`/`afterAll` hooks and
tinybench `setup`/`teardown` options so CodSpeed and plain `vitest bench` both
exercise setup and teardown.

## Scenario Responsibilities

The current aggregate targets include the baseline apps and every completed
scenario through plan 17.

| Scenario                  | Client-side responsibility                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Baseline apps             | Broad mixed navigation loop preserving current CodSpeed continuity.                                                                 |
| `route-matching`          | Large route-tree matching, route sorting, params parse/stringify, splat and optional segments.                                      |
| `location-building-links` | `buildLocation`, `Link`, active state, relative targets, hash/search/state preservation, and match checks.                          |
| `search-params`           | Search parse/stringify, validation, middleware, deep equality, custom serialization, and structural sharing.                        |
| `before-load-context`     | Serial `beforeLoad`, context merge, context consumers, and context invalidation.                                                    |
| `loader-cache`            | Loaders, `loaderDeps`, fresh/stale cache paths, `shouldReload`, stale reload modes, and invalidation.                               |
| `preloading`              | Manual/link preloads, dedupe, component preload hooks, and preload-to-navigation promotion.                                         |
| `subscribers-selectors`   | Framework hook subscriptions, selectors, router stores, and structural sharing.                                                     |
| `outlets-remounts`        | Deep outlets, lifecycle callbacks, and remount deps.                                                                                |
| `control-flow`            | Redirects, not-found, validation errors, loader errors, error boundaries, and unmatched routes.                                     |
| `interrupted-navigations` | Superseded navigations, abort signals, pending match cleanup, and final commit ordering.                                            |
| `scroll-restoration`      | Scroll cache bookkeeping, nested scroll areas, hash scrolling, and reset behavior.                                                  |
| `masking-rewrites`        | Route masks, URL rewrites, basepath, public hrefs, and trailing slash handling.                                                     |
| `head-management`         | Nested route head evaluation, DOM head updates, and dedupe.                                                                         |
| `deferred-await`          | Deferred loader data, fallback rendering, controlled promise resolution, and follow-up renders.                                     |
| `history-events-blockers` | History push/back/forward, router events, and logical navigation blockers.                                                          |
| `hydration-resume`        | Client hydration of dehydrated matches, skipped first-load loader work, deferred placeholders, and first post-hydration navigation. |

## Run

Run all benchmarks through Nx so dependency builds are part of the graph:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf --outputStyle=stream --skipRemoteCache
```

Run framework-specific benchmarks:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:solid --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:vue --outputStyle=stream --skipRemoteCache
```

Build a framework's baseline app and completed scenario apps:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:build:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:build:solid --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:build:vue --outputStyle=stream --skipRemoteCache
```

Run framework-specific flame benchmarks (10 second loop, profiled with `@platformatic/flame`, forced to `NODE_ENV=production`):

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:flame:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:flame:solid --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:flame:vue --outputStyle=stream --skipRemoteCache
```

Typecheck benchmark sources:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:types --outputStyle=stream --skipRemoteCache
```

Run a completed scenario target directly by project name when debugging a single
scenario:

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-route-matching-react:build:client --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-route-matching-react:test:types:client --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-route-matching-react:test:flame --outputStyle=stream --skipRemoteCache
```

Replace `route-matching` and `react` in the project name with any completed
scenario and framework pair listed in the responsibility table.
