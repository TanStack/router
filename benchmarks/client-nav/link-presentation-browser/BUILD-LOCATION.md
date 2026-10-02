# Public destination builder attribution

This production browser fixture supplements the dense Link remount measurement.
It isolates `router.buildLocation` from React rendering, source publication,
navigation, route-tree construction, and destination allocation. It cannot
establish that a builder optimization fixes the real remount regression.

Copy the identical fixture, config, project target, and paired runner into each
isolated arm before building. Retain source hashes with each built artifact.
Use the repository's Node and pnpm versions, run `pnpm format`, and build one arm
at a time through Nx:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build:build-location --outputStyle=stream --skipRemoteCache
```

The target depends on the arm's own React Router production package build and
emits `dist-build-location/`. The default `main` and `pending` entries are unchanged.
Serve that directory at
`http://127.0.0.1:4180/<arm>/build-location/`, then run
`paired-build-location.js` through the existing Playwright CLI workflow. The
runner's `origin`, `armNames`, and `entry` are separate configuration constants;
the default current PR label is `unified-root`.

The fixture creates one Router with the dense fixture's root search validator,
`items/$id` and `source` routes, and memory history initially at `/source`.
It awaits public `router.load()` before timing. Every owned destination copies
the fixed Rows props: absolute `to`, fresh `params` alternating IDs `0` and `1`,
`activeOptions`, `data-row`, and child text. Its `_fromLocation` comes from public
`router.state.location`; no private cache or state is written.

Each timed batch performs exactly 1,000 public builder calls and writes their
results into an array allocated before the timer. Fresh destination objects,
parameter objects, and the public source read are excluded from the interval.
All 1,000 results are checked outside timing for pathname, href, public href,
search, state, hash, and absence of a mask; the source must remain `/source`.

- `fresh-build`: each batch owns 1,000 new destinations, each built once.
  Expected output is `/items/0` or `/items/1`, with empty search and state.
- `warm-hit`: repeated calls use 1,000 destinations built once during untimed
  setup. Preflight reports public result identity reuse without asserting that
  every arm has the same cache policy. Expected values match fresh builds.
- `validated-build`: fresh destinations set the same legacy
  `_includeValidateSearch: true` field in every arm. The real root validator
  must produce `?page=0`, `{ page: 0 }` search, and empty state. This is a
  validated builder case, not an actual click or reuse-across-mode comparison.
  No new positional builder argument is used.

Each arm/case receives 24 untimed warmup batches, then 48 recorded batches.
An untimed task yield separates batches. Each case loads a new document to
avoid previous cases' JIT/cache history. The four-arm Williams order balances
positions and immediate predecessors; repeating its complete four-block design
twice gives eight independent paired blocks. Case order rotates by block.
The raw return value includes every sample and the preflight outputs.

Compare paired block means per case, with confidence intervals across the eight
block pairs. `buildMs` is milliseconds per 1,000 calls; divide by 1,000 only when
explicitly reporting per-call values. Inspect dispersion, timer-resolution zeros,
and outliers, particularly in the warm-hit control. Do not pool all samples as
independent replicates. Stop builds and other CPU-heavy work while timing.
