# Compiler performance harness

Measures, on large generated apps, how the TanStack compiler (route generator,
code splitting, HMR injection, Start server-function and environment
transforms, `<Hydrate>` handling, import protection) affects what users wait for:

1. **Dev startup**: process start → server listening → first page hydrated in
   Chromium, plus a "compile everything" variant that isolates transform
   throughput.
2. **HMR**: file save → updated DOM, per kind of edit.
3. **Production build**: wall-clock of `vite build` (client + SSR) and
   `rsbuild build`.

and attributes main-thread time to our plugins (CPU profiles plus per-plugin
hook timing).

## Workloads

`scripts/generate.mjs` writes deterministic (seeded) apps into `apps/` (git-ignored):

| variant        | contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-start`  | TanStack Start (Vite and Rsbuild configs): 338 route files (10 sections × 3 groups, nested layouts, pathless/group/splat/param routes, 5 server routes), loaders, `validateSearch`/`loaderDeps`, `beforeLoad`, pending/error/notFound components, 106 server functions (20 files + inline, validators, middleware), `createIsomorphicFn`/`createServerOnlyFn`/`createClientOnlyFn`, `ClientOnly`, 10 `<Hydrate>` boundaries, `*.server.ts` modules, 40 shared components |
| `react-router` | the same route tree as a client-only Router app with `autoCodeSplitting`, no Start features                                                                                                                                                                                                                                                                                                                                                                              |

Every result records a hash of the generated sources (`workloads.<variant>.hash`);
`compare.mjs` warns when baseline and candidate inputs differ. Apps resolve
dependencies through this package, which links the built workspace packages.

## Running

From the repository root of any checkout that contains this directory:

```sh
CI=1 pnpm install --frozen-lockfile
# Builds @tanstack/react-start, router-plugin, react-router through Nx, then runs everything.
node benchmarks/compiler-perf/scripts/run.mjs --label <name> --out <dir>
```

Results: `<dir>/results.json` (all samples + stats), `<dir>/summary.md`,
`<dir>/run.log`, and `<dir>/profiles/` (CPU profiles + hook timings).
Without `--out`, results go to `benchmarks/compiler-perf/results/<label>/`.

Useful options (`--help` lists all):

- `--variants react-start,react-router`
- `--scenarios build,dev-compile,dev-cold,dev-warm,hmr,rsbuild,profile`
- `--runs 5 --warmup 1` (startup/build), `--hmr-iterations 20 --hmr-warmup 3`
- `--skip-package-builds` when the packages are already built
- `--max-busy 1.5`: before every run (and every HMR edit) the harness samples
  `/proc/stat` and waits while other processes keep more than 1.5 cores busy
  (up to `--quiet-timeout` seconds; runs that time out are recorded with
  `flagged: true`). Each run records `busyCores` and the 1-minute load.
  A pre-run sample is not enough (bursty neighbours slowed one series by
  ~10% while every pre-run sample was below 4), so each run also records
  `othersBusyDuring`: system-wide busy time during the run minus the
  harness's own process tree (dev server, build, Chromium). Runs above
  `--max-busy` are flagged and repeated, up to `--retries` (default 5) per
  scenario and 3× that many HMR edits per kind; remaining flagged runs are
  kept, counted in `summary.md` and reported by `compare.mjs`. The default
  is strict on purpose: on a 32-core machine, 2–4 cores of unrelated load
  slowed the browser startup scenarios by 5–15% (likely lower boost clocks),
  far more than the number of busy cores suggests.

Compare two runs:

```sh
node benchmarks/compiler-perf/scripts/compare.mjs <baseline>/results.json <candidate>/results.json --md compare.md
```

### Running against a checkout without this directory

Copy the directory into the other checkout, add its lockfile importer, build and
run (nothing else in the lockfile changes, all dependencies are already
resolved there):

```sh
rsync -a --exclude apps --exclude results --exclude node_modules \
  benchmarks/compiler-perf/ <other-checkout>/benchmarks/compiler-perf/
cd <other-checkout>
CI=1 pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile
node benchmarks/compiler-perf/scripts/run.mjs --label <name> --out <dir>
```

Use the same Node binary for baseline and candidate (`compare.mjs` warns
otherwise). pnpm may select a different Node per checkout from its `.nvmrc`,
so pass an absolute path, e.g.
`NODE=$(cd <baseline-checkout> && node -p process.execPath); $NODE benchmarks/compiler-perf/scripts/run.mjs ...`.

Each generated app links `vite` and `@rsbuild/core` (`apps/<variant>/node_modules/`)
to the instance the TanStack plugin packages resolve (`meta.shared` in the
results). A workspace can contain several peer-dependency variants of the same
Vite version, and a second instance breaks Start's dev server detection
(`instanceof RunnableDevEnvironment`).

## Scenarios and metrics

All times are milliseconds, wall-clock unless stated.

| scenario                | metrics                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<variant>/build`       | `buildMs`: `vite build` process wall time (client + SSR environments for Start), output and cache dirs removed first                                                                                                                                                                                           |
| `<variant>/dev-compile` | `listenMs`; `compileAllMs`: after listening, `environment.transformRequest` on every route file, the router entry and the route tree, crawling their imported app modules (split chunks, server-function modules, virtual modules) per environment (`clientMs`, `ssrMs`, module counts). Cold dependency cache |
| `<variant>/dev-cold`    | `listenMs`: process spawn → `server.listen()` resolved; `hydratedMs`: spawn → root component's first effect in Chromium on `/` (`listenToHydratedMs` from navigation start). Dependency cache removed; a dependency-optimizer reload counts towards the time (`reloads`)                                       |
| `<variant>/dev-warm`    | the same with the dependency cache from the previous run kept                                                                                                                                                                                                                                                  |
| `<variant>/hmr/<kind>`  | `updateMs`: file write → the edited text appears in the page (MutationObserver timestamp in the page); `fullReloads` per edit                                                                                                                                                                                  |
| `react-start/rsbuild-*` | `rsbuild build` wall time; `rsbuild dev` spawn → port open → hydrated                                                                                                                                                                                                                                          |
| attribution (`profile`) | one extra run each of dev-compile, dev-cold and build (and rsbuild build) under `node --cpu-prof` with hook timing on                                                                                                                                                                                          |

HMR kinds (`react-router` has the first three):

- `route-component`: text in a route component (`src/routes/s00/g0/i0.tsx`)
- `route-loader`: value returned by a route loader and rendered (`i1.tsx`)
- `shared-component`: a non-route component used by a route (`src/components/ProbeWidget.tsx`)
- `server-fn`: the return value of a server function handler (`src/server/probe.ts`); measured as save → the first call from the page that returns the new value (the page calls it in a loop)
- `hydrate`: text inside a `<Hydrate when={visible()}>` boundary (`i4.tsx`), after the boundary has hydrated

Dev servers run through `scripts/dev-driver.mjs` (`vite.createServer` + `listen`,
with Node's compile cache enabled like the Vite CLI). The Node compile cache and
the OS file cache stay warm between runs; "cold" means no Vite dependency cache
and no build output.

### Attribution

- **CPU profile** (`attribution.<run>.cpu.main`): `compilerInclusiveMs` is the
  main-thread time of samples with a TanStack compiler frame on the stack
  (`router-plugin`, `router-generator`, `router-utils`, `start-plugin-core`,
  `*-start/dist/esm/plugin`, `react-start-rsc`, `virtual-file-routes`, any
  `packages/*compiler*` or `yuku` package); this includes the Babel/Prettier
  work they call. `compilerShareOfBusy` divides it by the non-idle main-thread
  time. `byCategory` is self time by owner (babel, vite, rolldown JS glue,
  gc, ...). Native frames inherit their caller's owner. Extend the compiler
  package list with `COMPILER_PERF_COMPILER_RE=<regex>`.
- **Hook timing** (`attribution.<run>.hooks`, Vite only): every JS plugin hook
  is wrapped (`scripts/hook-timing.mjs`, inert unless
  `COMPILER_PERF_HOOKS_OUT` is set). `syncMs` is main-thread time until the
  hook returned, so it misses work after an `await`; `settledMs` overlaps
  between concurrent modules and is not additive. Rolldown builtin plugins are
  native in builds and are not wrapped.

Profiled runs are slower than unprofiled ones; use them for shares, not for
absolute times.
