# Memory Benchmarks

Dedicated memory benchmarks for TanStack Router / Start, measured with the
CodSpeed **memory instrument** (`mode: memory` in
`.github/workflows/client-nav-benchmarks.yml`). The workflow runs on every
push to `main` except docs/examples/e2e-only pushes: CodSpeed compares a PR
against the run on its merge-base commit, and a main commit without a run makes
CodSpeed silently fall back to an older base — a single outlier base run then
flags phantom regressions on every PR until the next run lands. (Falling back
across a docs-only commit is safe: the previous run's benchmark-relevant code
is identical.) Two separate benchmarks:

- `server/` (`@benchmarks/memory-server`) — React/Solid/Vue Start apps, requests against
  the built server handler (`handler.fetch`), Node environment.
- `client/` (`@benchmarks/memory-client`) — router-only React/Solid/Vue apps in jsdom.

These deliberately do **not** reuse the CPU scenarios in `benchmarks/ssr` and
`benchmarks/client-nav`: memory benches need their own iteration counts,
payload sizes, and route shapes, and tuning those must never shift the CPU
baselines. Each scenario keeps a framework level (`react/`, `solid/`, `vue/`)
so framework ports can be added without renames.

## Layout

```text
benchmarks/memory/<server|client>/
  package.json                  Nx targets: build:<framework>, test:perf:<framework>, test:flame:<framework>, test:types
  bench-utils.ts                memoryBenchOptions, seeded LCG (+ sequential request loop on the server side)
  vitest.<framework>.config.ts  aggregates scenarios/*/<framework>/vite.config.ts
  scenarios/<scenario>/<framework>/
                                one isolated app per scenario + setup.ts + memory.bench.ts + memory.flame.ts
```

One app per scenario; apps and bench names are stable once landed (CodSpeed
continuity). Never grow an existing scenario for a new case — add a scenario.
`setup.ts` imports the built app and exports the concrete workload;
`memory.bench.ts` registers `bench(...)` directly, and `memory.flame.ts` runs the
same workload through the Flame profiler.

## How the memory instrument executes a bench

- The bench function is warmed up, then **measured exactly once**, starting
  after a forced GC. Under plain `vitest bench` the suites only smoke-test:
  timing output is meaningless; real numbers come from CodSpeed.
- Under CodSpeed the bench fn runs several warmup invocations plus the
  measured one. Client suite hooks mount a fresh app before each invocation
  and tear it down afterward, outside the measurement window. This prevents
  warmup navigation history and caches from changing the starting state.
  Module-level counters/LCGs keep generated URLs unique across invocations.
- Plain `vitest bench` never runs suite hooks (`beforeEach`/`afterEach`) and
  only honors tinybench's `setup`/`teardown` options; the CodSpeed runner
  does the exact opposite. Client benches therefore register **both** — in
  any given mode exactly one pair runs.
- CI builds through Nx before instrumentation, then `run.ts` replaces itself
  with Vitest. This removes Nx/pnpm from the tracked process tree and applies
  CodSpeed's predictable flags to the coordinator as well as its workers.
- Worker flags live in `runtime.ts` and apply only to the CodSpeed memory
  instrument. They supplement the integration's predictable execution flags.
  Disabling machine-code generation and bytecode flushing keeps compiler allocations
  out of the signal. GC follows allocation thresholds without incremental
  marking or minor-GC tasks; a fixed initial old-generation budget reduces
  sensitivity to startup heap policy.
- Before each CodSpeed invocation, a setup hook yields to the event loop,
  outside the measurement marker and before CodSpeed forces GC. Promise-only
  warmup chains can keep WeakRef targets alive through a collection in the same
  job. Client app setup also runs before the forced GC.
- Do not force GC inside a measured request loop or poll `heapUsed` to choose
  how much work to do. Both introduce allocator activity from the harness into
  the measurement. Footprint scenarios run exactly one large request per
  invocation; churn scenarios retain their fixed sequential request counts.
- Error-path cases use separate isolated workers so one case's module and
  allocator history cannot contaminate the next case.
- Keep each bench under **~1.5M allocations** (instrument overhead grows past
  2M); this is the main constraint when tuning iteration counts.

## Bench shapes and signals

- **Churn:** a fixed number of sequential operations, measuring native
  allocation activity and peak outstanding native allocations.
- **Peak (footprint):** one large operation, measuring its native footprint.

CodSpeed reports native allocator activity, not individual JavaScript object
allocations or retained JS heap size. V8 can reuse heap pages without a visible
native allocation. These benchmarks can detect native buffering and allocator
regressions, but a flat graph does not establish that route data or JS objects
are collectable. Absolute numbers include Node/framework/jsdom activity under
benchmark-specific V8 settings; compare identical harness versions.

## Scenarios

### Server

| Scenario                | Shape | Exercises                                                 |
| ----------------------- | ----- | --------------------------------------------------------- |
| `request-churn`         | churn | cross-request retention in document SSR (unique URLs)     |
| `server-fn-churn`       | churn | retention in the server-function RPC path                 |
| `error-paths`           | churn | redirect/notFound/error/unmatched paths pinning contexts  |
| `aborted-requests`      | churn | dangling streams/listeners after mid-stream client aborts |
| `peak-large-page`       | peak  | per-request peak scaling with page size                   |
| `streaming-peak`        | peak  | streaming buffering O(document) instead of O(chunk)       |
| `serialization-payload` | peak  | double-buffering / string-copy blowups in dehydration     |

### Client

| Scenario                  | Shape | Exercises                                                |
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
- Randomness only via the seeded LCG in `bench-utils.ts`. Deferred streaming
  uses counted zero-delay timer hops to stage work. Timers still depend on the
  event loop, so validate repeatability on CI instead of assuming deterministic
  ordering from a zero delay alone.
- Sanity assertions run once at module load and throw on wrong
  status/markers, so a bench can never silently measure the wrong thing.
- Server requests follow `benchmarks/ssr` conventions: document GETs send
  `accept: text/html`, server-fn requests send `sec-fetch-site: same-origin`
  with bodies precomputed at module level.
- Client apps export `mountTestApp` from `app.tsx`; benches import the built
  `dist/app.js`; navigations use `replace: true`; unmount does full teardown
  (framework root, `__TSR_ROUTER__`, `history.destroy()`); large loader payloads
  are never rendered into the DOM.
- `NODE_ENV=production` everywhere (the Nx targets set it).

## Run

Smoke-test the CodSpeed/Vitest benchmark entrypoints and typecheck the
scenarios:

```bash
pnpm nx run @benchmarks/memory-server:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-server:test:perf:solid --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-server:test:perf:vue --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-client:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-client:test:perf:solid --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-client:test:perf:vue --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-server:test:types --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-client:test:types --outputStyle=stream --skipRemoteCache
```

Local attribution profiling, without CodSpeed CLI/login/sudo/upload, uses
`@datadog/pprof` heap sampling and `@platformatic/flame` only to render the
captured pprof files as HTML/Markdown. These targets rebuild the scenarios with
`--sourcemap true` so the generated profile reports can point back to source;
the normal CodSpeed benchmark builds are unchanged. Local aggregate scripts run
with `--parallel=1`, and scenario `test:flame` targets opt out of Nx parallelism
so profiling workloads do not overlap and bias each other. The Vitest aggregate
configs also set `fileParallelism: false` so benchmark files run sequentially
inside `test:perf:react`.

```bash
pnpm benchmark:memory:server:flame
pnpm benchmark:memory:client:flame
pnpm benchmark:memory:server:flame:solid
pnpm benchmark:memory:client:flame:solid
pnpm benchmark:memory:server:flame:vue
pnpm benchmark:memory:client:flame:vue
```

To profile one scenario, run its `test:flame` target directly:

```bash
pnpm nx run @benchmarks/memory-server-request-churn-react:test:flame --outputStyle=stream --skipRemoteCache
pnpm nx run @benchmarks/memory-client-navigation-churn-react:test:flame --outputStyle=stream --skipRemoteCache
```

Flame writes reports under the scenario's ignored `.profiles/<timestamp>/`
directory, including `heap-profile-*.html` and `heap-profile-*.md`. The
`memory.flame.ts` entrypoints run the same workload shape as `memory.bench.ts`
but manually start profiling after sanity/setup work and stop it after the
measured workload. Treat these profiles as diagnostic heap-sampling attribution;
they are not CodSpeed memory metrics such as peak memory, allocated bytes, or
allocation counts. The heap sampler is stopped before profile conversion and
Flame report generation, so Flame/pprof report-generation work should not appear
as part of the captured workload. Flame runs do not force GC before profiling;
doing so would perturb the workload and still would not make heap sampling
equivalent to CodSpeed memory metrics.

Clean local Flame profile output with:

```bash
pnpm --filter @benchmarks/memory-server clean:profiles
pnpm --filter @benchmarks/memory-client clean:profiles
```

Client memory benches are useful for regression tracking of router/React/jsdom
integration behavior and native allocation activity. They are not pure
browser-memory measurements, and local Flame attribution can include jsdom,
React DOM, and profiler shutdown frames.

Real memory measurement, locally (requires the CodSpeed CLI, `codspeed setup`
once to install the memory executor, and sudo; **uploads results to the
CodSpeed dashboard** — local runs do not affect PR baselines):

```bash
pnpm nx run @benchmarks/memory-client:build:react
NODE_ENV=production WITH_INSTRUMENTATION=1 codspeed run --mode memory -- node benchmarks/memory/run.ts client react
```

Replace `client` with `server`, or `react` with `solid`/`vue`, to run another
group. Build the matching target first.

Run only memory jobs on an experiment branch:

```bash
gh workflow run client-nav-benchmarks.yml --ref <experiment-branch> -f memory-only=true
```

Repeat at the same commit, using distinct branch names if runs should overlap
(the workflow serializes runs on the same ref). Compare all 48 fresh memory
results: 18 client and 30 server. Exclude inherited CodSpeed results and failed
or incomplete repetitions. For each workload, calculate
`100 * (max / min - 1)` across runs for peak bytes, allocated bytes, and
allocation counts; aggregate averages hide unstable cases.
