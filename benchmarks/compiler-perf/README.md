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
hook timing). Optional scenarios measure the **floor** (the same scenarios
with the compiler's outputs replayed, i.e. what they would cost with a
zero-cost compiler) and **memory** (peak RSS, heap after GC, HMR leak check).

## Workloads

`scripts/generate.mjs` writes deterministic (seeded) apps into `apps/` (git-ignored):

| variant            | contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-start`      | TanStack Start (Vite and Rsbuild configs): 338 route files (10 sections × 3 groups, nested layouts, pathless/group/splat/param routes, 5 server routes), loaders, `validateSearch`/`loaderDeps`, `beforeLoad`, pending/error/notFound components, 106 server functions (20 files + inline, validators, middleware), `createIsomorphicFn`/`createServerOnlyFn`/`createClientOnlyFn`, `ClientOnly`, 10 `<Hydrate>` boundaries, `*.server.ts` modules, 40 shared components                                                                                                                                                                                                                                           |
| `react-router`     | the same route tree as a client-only Router app with `autoCodeSplitting`, no Start features                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `solid-start`      | `react-start` written for Solid (signals, `<For>`/`<Show>`, `class`, accessor router hooks); Vite only (`vite-plugin-solid`; no Rsbuild config, which would need `@rsbuild/plugin-babel` + `@rsbuild/plugin-solid`). Same route tree, server functions and probes                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `solid-router`     | `react-router` written for Solid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `react-start-deps` | `react-start` plus a large generated dependency graph under the app's own `node_modules` (`@bench/icons`: a side-effect-free barrel of 2,000 icon components; `@bench/utils`: a chain of 400 modules; `@bench/start-lib`: a Start library calling `createServerFn`, wrapping `<ClientOnly>` and importing a 2 MB `engine.wasm?url` asset) that every route imports, with tanstack.com's `manualChunks` group of Start's runtime in its Vite config. Opt-in (`--variants react-start-deps`); no Rsbuild config. Shows dependency-scope regressions of the compilers (what is compiled, read or parsed under `node_modules`: tanstack.com issue 4 compiled 22.6 k dependency modules and read a 13 MB asset as text) |

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

- `--variants react-start,react-router` (default); the Solid variants run with
  `--variants solid-start,solid-router`. The Solid apps keep the React apps'
  structure (same seeded choices), so React and Solid numbers are comparable
  per scenario, but Solid's own JSX transform runs Babel in every variant.
- `--scenarios build,dev-compile,dev-cold,dev-warm,hmr,rsbuild,profile` (the
  default set); also `rsbuild-build`/`rsbuild-dev` (the halves of `rsbuild`),
  `floor`, `memory`, `leak` (see below)
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

### Floor (`--scenarios floor`)

How fast each scenario would be if the TanStack compiler cost nothing while
producing exactly the same output. `scripts/replay.mjs`:

- **record** (one unmeasured run per scenario): every hook of a plugin whose
  name matches `tanstack` (`COMPILER_PERF_REPLAY_PLUGINS` overrides the regex)
  that returns code (`transform`, `load`, `renderChunk`; Rsbuild
  `api.transform` handlers; unplugin `transform`/`load` hooks under Rspack;
  Rspack loaders shipped by `@tanstack/*` packages, wrapped in Node's require
  cache so module ids do not change; Rspack `VirtualModulesPlugin` writes) runs
  for real and its result is stored by (environment, plugin, hook, id with
  `v=`/`t=` queries stripped, hash of the input code), plus the call's
  occurrence index.
- **replay** (the measured `<variant>/floor-<scenario>` runs): the store is
  deserialized when the config loads, and those hooks return the stored
  result without running. A miss runs the real hook (`misses`; should be 0).
  The load time (`replayLoadMs`) is subtracted from the times (`raw*` keeps
  the unadjusted values).

It works on any compiler implementation because it keys on plugin names, hook
identity and loader packages, not on compiler internals. `--floor` selects the
scenarios (default `build,dev-compile,dev-cold,hmr,rsbuild-build`); run the
real scenarios in the same invocation so `summary.md` can put real and floor
side by side.

Checks and limits:

- Build output is hashed (`outputHash`); dev compile-all hashes every served
  module per environment (`clientOutputHash`, `ssrOutputHash`, with
  per-session queries and Vite's run-dependent CJS interop order
  normalized). `outputMismatch` counts hashes that differ from the record
  run; `results.floor.<scenario>.realMatches` compares the record run with
  the real run.
- The other hooks of the same plugins still run (`otherTanstackHookSyncMs`):
  `resolveId`, `hotUpdate`, `generateBundle`, and the **route generator**
  (Vite `configResolved`, Rspack `beforeRun`), reported as `generatorMs`
  (settled time; on the startup critical path, so `floor − generatorMs`
  estimates a floor without the generator). `routeTree.gen.ts` is kept
  between runs, so the generator only checks and does not rewrite it.
- Side effects of replayed hooks do not happen (`this.addWatchFile`, extra
  `this.load` calls of the server-fn lookup, compiler caches). The output
  checks catch side effects that change output.
- Floor HMR uses deterministic edit tokens; the record run makes extra edits
  to cover the replay run's retries.

### Memory (`--scenarios memory,leak`)

`scripts/memory.mjs` takes snapshots with `--expose-gc` (two full GCs first):
V8 `heapUsedMb`, `externalMb`, `arrayBuffersMb`, `rssMb`, `peakRssMb` (VmHWM)
and the RSS of descendant processes (`childPeakRssMb`, sampled every 200 ms).
Memory runs are separate from timed runs (`--memory-runs`, default 3).

- `mem-build`, `mem-rsbuild-build`: CLI build preloaded with
  `--import memory.mjs`; the snapshot is taken at process exit.
- `mem-dev-cold`: dev server after `/` hydrated; `mem-dev-compile`: after
  compile-all.
- `leak`: dev server after a cold start with `/` and one page per probe open,
  snapshot, then `--leak-cycles` (default 50) edit + revert cycles rotating
  over route component, route loader, server function handler and shared
  module, each waiting for the edit and for the revert to show up; a
  snapshot every 10 cycles (`series`) and at the end. `heapGrowthMb` /
  `rssGrowthMb` are end − start.

### Soak (`--scenarios soak`)

`soakRun` in `scripts/run.mjs`: one dev server (`--soak-bundlers vite,rsbuild`;
Rsbuild for `react-start` only), `--soak-cycles` (default 500) edit + revert
cycles rotating over the kinds of `scripts/soak-files.mjs`: the HMR probes
(route component, loader, shared module, server-fn handler, `<Hydrate>`),
module adds and deletes (a new module imported by a soak route, then
dropped and deleted), route adds and deletes (route tree regenerated), route
renames, adding/removing a `*.server.ts` import (alternately read by a
server-fn handler and by client code, an import-protection violation), and
dependency-only factory flips (`src/soak/factory.ts` stops/starts exporting a
server-fn builder; only its importer's output changes). Every name is a
function of the cycle index (record/replay sees the same files).

Every `--soak-every` cycles (default 25): forced GC, `heapUsed`, `external`,
`arrayBuffers`, RSS, and the compiler's cache sizes (`TSR_COMPILER_STATS=1`,
below); heap snapshots after the `--soak-snapshots` cycles (default
`0,100,500`; the cycle-0 snapshot absorbs V8's one-time snapshot overhead).
`--soak-modes`: `real`, `replay` (record run, then a run with our transform
hooks replaced by the recorded outputs, see Floor), `transform-off` (Router
app with splitting and HMR off: nothing reaches the compiler).

- `scripts/soak-analyze.mjs <soak-*.json>`: OLS slope of each GC'd metric
  (KB/edit, 95% CI) over the last 75% of the samples, and per cache counter
  its values, slope per 100 cycles and whether it grows.
- `scripts/heap-diff.mjs A.heapsnapshot B.heapsnapshot`: per-constructor
  growth, new survivors, and retained self size by _owner_ (the first
  function or class instance on the shortest retaining path whose script
  belongs to a package), A → B (`--owner-detail <name>` lists one owner's
  largest objects with their paths).

### Compiler introspection and cache knobs (dev-only measurement aids)

Environment variables read by `@tanstack/router-utils/compiler` (inert unless
set; Node-side only, never in a bundle):

- `TSR_COMPILER_STATS=1`: the compiler caches (`PlanCache`, dependents index,
  `RawFactsCache`, resolution caches, with approximate bytes and hit/miss
  counters), the hosts' sessions (import protection, server-fn registries,
  Rsbuild per-resource records) and the route generator register size
  readers in a process-global registry (`compilerStats()`; the dev driver
  and `scripts/ipc-agent.mjs` answer `{ type: 'stats' }`).
  `TSR_COMPILER_STATS_BYTES=0` skips the byte estimates.
- `TSR_COMPILER_NO_CACHE=<list>`: disables caches for on/off measurements:
  `plans` (no plan is published: every request, derived ids included,
  plans again), `facts` (summaries and target facts re-read and re-parsed
  on every request), `targets` (target facts only), `all`. Outputs are
  identical with any knob (`stats.test.ts`). Resolutions and emitted
  outputs are not cached (R54): nothing to switch off.
- `scripts/cache-knobs.mjs --out <dir>`: runs the harness per (round, knob),
  interleaved, and tabulates medians per knob against "all on".

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
