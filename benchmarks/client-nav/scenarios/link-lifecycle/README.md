# Link lifecycle workload

This optional React scenario complements the existing persistent-Link suite.
It uses the existing client-navigation and mount-loop harnesses unchanged.
No generated route files are needed: this small workload uses code-based routes.

- **Departing owners:** 200 Links belong to alternating `/` and `/away` route
  components. Every completed navigation replaces the owning route. Their search
  updaters derive targets from the source page, so early location notification
  can otherwise rebuild outgoing Links immediately before unmounting them.
- **Persistent owners:** the identical 200-Link grid belongs to the root layout.
  Every navigation changes its inherited search and must update its hrefs.
  This covers a worst case where targeted notification cannot skip the grid.
- **First mount:** six fresh router/render/load/unmount cycles per batch with
  the 200-Link page. This includes registration and cleanup costs.

Navigation batches complete eight real Link clicks. Both controls persist,
replace history, and update active state; loaders yield through a resolved
promise without simulated latency. Untimed warm-up checks verify all hrefs,
active states, owner markers, control identity, grid lifetime and bounded history.
The existing mount harness checks the initial page before unmounting each tick.

Run each case in a fresh process using identical files on both revisions:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:types:client --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t departing.owners --outputJson /tmp/link-departing.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t persistent.owners --outputJson /tmp/link-persistent.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t first.mount --outputJson /tmp/link-first-mount.json
```

Repeat baseline/candidate processes in alternating order and report means,
relative margins of error and sample counts. These CPU measurements do not
prove JavaScript object collectability or quantify retained registry memory.

## Targeted invalidation scaling

Six additional cases use a separate route tree and leave the original three
workloads unchanged. The five navigation cases complete eight same-path Link
clicks per batch, changing only search or only hash:

| Case                         | What it measures                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `scaling unique 50 search`   | Small grid of distinct, unrelated static targets                                                                  |
| `scaling unique 1000 search` | Same best case at 20 times the Link count                                                                         |
| `scaling repeated 1000 hash` | 1000 exact `/` Links while visiting `/work`; ancestor indexing can unnecessarily visit the entire inactive bucket |
| `scaling mixed 200 search`   | Equal shares of dynamic search/hash targets, exact `/`, unique static targets, and active `/work` Links           |
| `scaling mixed 200 hash`     | The identical grid when only inherited hash changes                                                               |
| `scaling mount 1000`         | Six fresh router/mount/unmount cycles with unique targets, including registry construction and disposal           |

Untimed navigation warm-up checks every href and active state, both controls,
bounded history, and preservation of all mounted anchor elements. Mixed cases
verify dynamic hrefs change while unrelated static hrefs remain correct. They
use ordinary public search updaters and `hash={true}`, without injecting counters
or inspecting private stores. The scaling mount case checks the entire grid
once before timing; timed ticks only wait for the readiness marker. The original
first-mount workload retains its existing checks and measurement definition.

Run the type target above first, then each new case in a separate process. For
example:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t scaling.unique.50.search --outputJson /tmp/link-scale-unique-50.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t scaling.unique.1000.search --outputJson /tmp/link-scale-unique-1000.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t scaling.repeated.1000.hash --outputJson /tmp/link-scale-repeated.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t scaling.mixed.200.search --outputJson /tmp/link-scale-mixed-search.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t scaling.mixed.200.hash --outputJson /tmp/link-scale-mixed-hash.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t scaling.mount.1000 --outputJson /tmp/link-scale-mount.json
```

These cases complement `benchmarks/client-nav/link-performance`'s updater,
middleware, mask, rewrite, and active-state workloads. Compare matching cases
across revisions; differences between scaling modes also change the useful
work and cannot by themselves establish a speedup.

The original unique/repeated scaling grids belong directly to a root layout
that subscribes to route context. A navigation can rerender that parent and
recreate its `Item {index}` children arrays, so those cases include parent
rendering and changed Link props alongside location notification work.

## History formatter fanout

Four additional cases preserve the nine existing workloads. They use a separate
code-based route tree with persistent static targets and eight search-only
navigations per measured batch:

| Case                                        | Mechanism                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatter memory 0 external 200 internal`  | Built-in memory history; unrelated targets need no formatter refresh                                                                              |
| `formatter opaque 0 external 200 internal`  | A public `createHref` override reads `history.location.search`; every source page change updates the displayed prefix of 200 internal hrefs       |
| `formatter opaque 1000 external 8 internal` | The same opaque formatter with 1000 direct external Links and eight internal targets; exposes the cost of scanning records that bypass formatting |
| `formatter hash 0 external 200 internal`    | Built-in hash history in an isolated browser window, with a stable `/shell` outer path                                                            |

The ordinary and custom cases use the harness's public `createMemoryHistory`.
The hash case uses public `createHashHistory` with an isolated JSDOM window and
destroys that history/window on cleanup. No private capability metadata or
registry fields are read or changed. All cases check every final href and active
state, control href/activity, DOM persistence, the actual current history URL,
and a history length of one during untimed warm-up. Custom-format checks ensure
the output follows the new source search; direct external hrefs stay literal.
The hash case covers stable outer formatting, not changes to the outer shell.
These formatter grids also include parent rendering: their route-context layout
can rerender on navigation and recreate the Links' children arrays. Their times
measure the combined rendering and formatter workload, rather than isolating
the registry's scan of external records.

Run each case independently after the shared type target:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t "formatter.memory.0.external.200.internal" --outputJson /tmp/link-format-memory.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t "formatter.opaque.0.external.200.internal" --outputJson /tmp/link-format-opaque.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t "formatter.opaque.1000.external.8.internal" --outputJson /tmp/link-format-external.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t "formatter.hash.0.external.200.internal" --outputJson /tmp/link-format-hash.json
```

Use identical fixture files for baseline and candidate builds. These workloads
use only APIs shared by both revisions and include the two navigation controls
in addition to the target counts in their names.

## Isolated location fanout

Three additional cases preserve all thirteen earlier workloads and isolate source
publication against a stable mounted Link grid:

- `isolated fanout unique 1000 search`: 1000 unrelated static destinations while
  only the source search changes.
- `isolated fanout repeated 1000 hash`: 1000 exact `/` destinations while the
  source `/work` hash changes.
- `isolated fanout active 1000 hash`: 1000 identical `/work#first` destinations
  exclude search and include hash in exact activity matching. Alternating the
  source between `/work#first` and `/work#second` changes every Link's activity,
  exercising selection and notification of a fully populated path bucket.

A separate route tree renders the grid through `React.memo` with primitive
mode/count/input props. The grid has no route-context or location subscription,
so parent publications leave its Link elements and children arrays unchanged.
Links retain their ordinary public subscriptions. A mount-only render marker
lets untimed warm-up assert the grid rendered exactly once; existing checks
verify all hrefs/activity, active navigation controls, persistent anchors, and
bounded history. Eight complete Link-click navigations form each timed batch.

These cases isolate coordinator fanout; the earlier un-memoized cases still
cover parent-render integration cost. Compare each workload across revisions
using identical fixture files rather than subtracting noisy case means.

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t "isolated.fanout.unique.1000.search" --outputJson /tmp/link-isolated-unique.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t "isolated.fanout.repeated.1000.hash" --outputJson /tmp/link-isolated-repeated.json
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-lifecycle-react:test:perf --outputStyle=stream --skipRemoteCache -- --run -t "isolated.fanout.active.1000.hash" --outputJson /tmp/link-isolated-active.json
```
