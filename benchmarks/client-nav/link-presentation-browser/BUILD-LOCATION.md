# Public destination builder attribution

This production browser fixture isolates public `router.buildLocation` calls from React rendering, source publication, navigation, route-tree creation, and input/result-array allocation. It supplements navigation measurements; it cannot establish that a builder change fixes remount cost.

Build through the repository Node/pnpm versions and Nx, one command at a time:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build:build-location --outputStyle=stream --skipRemoteCache
```

The target depends on the arm's React Router package build and emits `dist-build-location/`. Copy identical fixture sources into every isolated arm and preserve source hashes. See [MATRIX.md](MATRIX.md) for portable bundle layout and source-map verification.

The fixture creates one Router with a real root search validator, `items/$id` and `source` routes, and memory history initially at `/source`. Setup awaits public `router.load()`. One destination pool contains 1,000 options, alternating IDs 0 and 1, with explicit `_fromLocation` taken from public `router.state.location`. No private cache or router state is mutated.

Each fresh or validated batch performs **10,000 calls**. Each warm-hit batch performs **1,000,000 calls**, cycling the same 1,000 warmed destinations. Input and result-array allocation precedes the measured interval; every returned location is checked afterwards. `batchMs` retains total batch time; `buildMs` normalizes to milliseconds per 1,000 calls. The return value includes the actual `calls` count.

- `fresh-build`: fresh destination pools, each destination built once. Expected output is `/items/0` or `/items/1`, with empty search and state.
- `warm-hit`: the 1,000 warmed options are reused across repetitions. Untimed preflight reports public result identity without requiring every arm to share a cache policy.
- `validated-build`: fresh options use `_includeValidateSearch: true` identically in every arm. The root validator produces `?page=0` and `{ page: 0 }` search. This is a builder invocation, not a click or a cross-mode reuse assertion.

The broad experiment uses 12 warmup and 24 measured batches per round for fresh/validated cases, and 6 warmup and 12 measured batches for warm hits. An untimed task yield separates batches. Each case loads a fresh document. Eight independent Williams rounds balance arm positions and immediate predecessors; case order rotates. Analyze paired round means, not individual correlated batches. Retain the clock probe, zeros, dispersion, batch durations, and call counts.

The final focused J/K matrix keeps these builders in its correctness gates but does **not** time them. Its five timed pages/six outcomes and embedded A/A calibration are documented in [MATRIX.md](MATRIX.md). Older `paired-*.js` scripts retain their historical sampling designs; do not substitute them for the frozen matrix runner.
