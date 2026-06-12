# Memory Benchmarks

Dedicated memory benchmarks for TanStack Router / Start, measured with the
CodSpeed **memory instrument** (`mode: memory` in
`.github/workflows/memory-benchmarks.yml`). Two separate benchmarks:

- `server/` (`@benchmarks/memory-server`) — React Start apps, requests against
  the built server handler (`handler.fetch`), Node environment.
- `client/` (`@benchmarks/memory-client`) — router-only React apps in jsdom.

These deliberately do **not** reuse the CPU scenarios in `benchmarks/ssr` and
`benchmarks/client-nav`: memory benches need their own iteration counts,
payload sizes, and route shapes, and tuning those must never shift the CPU
baselines. React-first; each scenario keeps a `react/` level so solid/vue can
be added later without renames.

## Layout

```text
benchmarks/memory/<server|client>/
  package.json                  Nx targets: build:react, test:perf:react, test:types
  bench-utils.ts                memoryBenchOptions, seeded LCG (+ sequential request loop on the server side)
  vitest.react.config.ts        aggregates scenarios/*/react/vite.config.ts
  scenarios/<scenario>/react/   one isolated app per scenario + memory.bench.ts
```

One app per scenario; apps and bench names are stable once landed (CodSpeed
continuity). Never grow an existing scenario for a new case — add a scenario.

## How the memory instrument executes a bench

- The bench function is warmed up, then **measured exactly once**, starting
  after a forced GC. Under plain `vitest bench` the suites only smoke-test:
  timing output is meaningless; real numbers come from CodSpeed.
- Under CodSpeed the bench fn runs several warmup invocations plus the
  measured one **on the same mount**, so bench fns must be idempotent and
  module-level counters/LCGs are used where ids must never repeat across
  invocations.
- Plain `vitest bench` never runs suite hooks (`beforeAll`/`afterAll`) and
  only honors tinybench's `setup`/`teardown` options; the CodSpeed runner
  does the exact opposite. Client benches therefore register **both** — in
  any given mode exactly one pair runs.
- The process runs with V8 determinism flags (predictable GC schedule,
  `--no-opt`). Never call `global.gc()` manually. Because of `--no-opt`,
  allocation counts overstate production; numbers are for regression
  tracking, not absolute claims.
- Keep each bench under **~1.5M allocations** (instrument overhead grows past
  2M); this is the main constraint when tuning iteration counts.

## Bench shapes and signals

- **Churn (leak detector):** N sequential iterations at steady state. If one
  iteration leaks L bytes, peak grows by ~N·L; healthy builds show a flat
  timeline floor independent of N. Tuning check: doubling N must leave peak
  roughly unchanged.
- **Peak (footprint):** one (or very few) large operations; peak memory
  scaling with the workload is the signal.

## Scenarios

### Server

| Scenario                | Shape | Guards against                                            |
| ----------------------- | ----- | --------------------------------------------------------- |
| `request-churn`         | churn | cross-request retention in document SSR (unique URLs)     |
| `server-fn-churn`       | churn | retention in the server-function RPC path                 |
| `error-paths`           | churn | redirect/notFound/error/unmatched paths pinning contexts  |
| `aborted-requests`      | churn | dangling streams/listeners after mid-stream client aborts |
| `peak-large-page`       | peak  | per-request peak scaling with page size                   |
| `streaming-peak`        | peak  | streaming buffering O(document) instead of O(chunk)       |
| `serialization-payload` | peak  | double-buffering / string-copy blowups in dehydration     |

### Client

| Scenario                  | Shape | Guards against                                           |
| ------------------------- | ----- | -------------------------------------------------------- |
| `navigation-churn`        | churn | per-navigation retention at steady state                 |
| `unique-location-churn`   | churn | unbounded href/search-keyed caches (never-repeated URLs) |
| `preload-churn`           | churn | preload-cache eviction not releasing memory              |
| `loader-data-retention`   | churn | departed routes' loader data staying pinned (gcTime 0)   |
| `mount-unmount`           | churn | router instances not collectable after dispose           |
| `interrupted-navigations` | churn | superseded navigations retaining closures/contexts       |

## Conventions

- Strictly sequential work: at most one request/navigation in flight; each
  server response is fully consumed before the next request. Pairing a single
  navigation with its render signal via `Promise.all([navigate, rendered])`
  is fine — never overlap distinct work items.
- Randomness only via the seeded LCG in `bench-utils.ts`; no `Math.random`,
  `Date.now`, or timers — with one documented exception: `streaming-peak`'s
  deferred sections use small `setTimeout` delays, because React schedules
  stream flushes via `setImmediate` and any non-timer deferral wins that race,
  suppressing the Suspense fallbacks the scenario exists to stream.
- Sanity assertions run once at module load and throw on wrong
  status/markers, so a bench can never silently measure the wrong thing.
- Server requests follow `benchmarks/ssr` conventions: document GETs send
  `accept: text/html`, server-fn requests send `sec-fetch-site: same-origin`
  with bodies precomputed at module level.
- Client apps export `mountTestApp` from `app.tsx`; benches import the built
  `dist/app.js`; navigations use `replace: true`; unmount does full teardown
  (React root, `__TSR_ROUTER__`, `history.destroy()`); large loader payloads
  are never rendered into the DOM.
- `NODE_ENV=production` everywhere (the Nx targets set it).

## Run

```bash
pnpm nx run @benchmarks/memory-server:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-client:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-server:test:types --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-client:test:types --outputStyle=stream --skipRemoteCache
```

Real memory measurement, locally (requires the CodSpeed CLI, `codspeed setup`
once to install the memory executor, and sudo; **uploads results to the
CodSpeed dashboard** — local runs do not affect PR baselines):

```bash
WITH_INSTRUMENTATION=1 codspeed run --mode memory -- pnpm nx run @benchmarks/memory-server:test:perf:react
WITH_INSTRUMENTATION=1 codspeed run --mode memory -- pnpm nx run @benchmarks/memory-client:test:perf:react
```
