# SSR Benchmarks

Cross-framework SSR request-loop benchmarks for:

- `@tanstack/react-start`
- `@tanstack/solid-start`
- `@tanstack/vue-start`

Each benchmark builds a Start app with file-based routes and runs Vitest benches against the built server handler.

## Layout

- `react/` - React Start baseline benchmark + Vitest config
- `solid/` - Solid Start baseline benchmark + Vitest config
- `vue/` - Vue Start baseline benchmark + Vitest config
- `vitest.react.config.ts`, `vitest.solid.config.ts`, `vitest.vue.config.ts` - per-framework aggregate configs that run the baseline first, then scenario projects
- `scenarios/<scenario>/<framework>/` - isolated scenario apps

Scenario app layout:

```text
scenarios/<scenario>/<framework>/
  vite.config.ts
  speed.bench.ts
  tsconfig.json
  src/
    router.tsx
    routes/
    routeTree.gen.ts
```

Each scenario uses one app per framework instead of sharing routes in the baseline app. This keeps route-tree size, middleware, Start options, and generated route trees isolated so one scenario cannot shift another scenario's numbers. The existing baseline apps and bench names stay stable for CodSpeed continuity.

## Scenario Responsibilities

Each scenario isolates one Start server-side responsibility so benchmark changes can be attributed to a specific feature area.

| Scenario                                 | Start server-side responsibility                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react/`, `solid/`, `vue/` baseline apps | Document SSR for nested file routes, route matching, search parsing, and full-page HTML response generation.                                                                                             |
| `control-flow`                           | Loader-thrown `redirect` and `notFound` handling, including HTTP status selection, redirect `location` headers, and not-found HTML rendering.                                                            |
| `head`                                   | Nested route `head` evaluation, title/meta/link serialization, and head-entry deduplication during SSR.                                                                                                  |
| `loaders`                                | Nested route loader execution, loader deps from search params, router context reads, and dehydrated loader payload generation.                                                                           |
| `selective-ssr`                          | Route-level `ssr` modes: rendered server HTML with `ssr: true`, dehydrated data without HTML with `ssr: 'data-only'`, and client-only omission with `ssr: false`.                                        |
| `server-fns`                             | `createServerFn` GET and POST request handling, function middleware context, input validation, serialized payload decoding/encoding, CSRF-compatible request headers, and server-function URL discovery. |
| `server-routes`                          | File route `server.handlers` dispatch for parameterized JSON API routes without document HTML rendering.                                                                                                 |
| `server-routes-middleware`               | Server route request middleware chains, middleware-provided context merging, and handler access to accumulated context.                                                                                  |
| `streaming`                              | Deferred loader data, `Await`/Suspense fallback output, larger streamed HTML body scanning, streamed HTML ordering, and later dehydration payload emission.                                              |

## Run

Run all benchmarks through Nx so dependency builds are part of the graph:

```bash
pnpm nx run @benchmarks/ssr:test:perf --outputStyle=stream --skipRemoteCache
```

Run framework-specific benchmarks:

```bash
pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/ssr:test:perf:solid --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/ssr:test:perf:vue --outputStyle=stream --skipRemoteCache
```

Build framework-specific benchmark apps:

```bash
pnpm nx run @benchmarks/ssr:build:react --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/ssr:build:solid --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/ssr:build:vue --outputStyle=stream --skipRemoteCache
```

Typecheck benchmark sources:

```bash
pnpm nx run @benchmarks/ssr:test:types --outputStyle=stream --skipRemoteCache
```

Run one scenario app manually through Nx:

```bash
pnpm nx run @benchmarks/ssr-<scenario>-<framework>:build:ssr --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/ssr-<scenario>-<framework>:test:types:ssr --outputStyle=stream --skipRemoteCache
```

Use `react`, `solid`, or `vue` for `<framework>`. The baseline projects use `@benchmarks/ssr-<framework>` without a scenario segment.

## Request Conventions

- Document GET loops use `accept: text/html`, matching the baseline request shape.
- Server-function loops must include `sec-fetch-site: same-origin` so the default CSRF middleware accepts the request.
- Loops that expect non-200 responses pass a custom `validateResponse` to `runRequestLoop`.
- Bench loops must build deterministic requests from the seeded random helper and consume response bodies through `runRequestLoop` or `runSsrRequestLoop`.
