# Synchronous client-lane optimization

## Reproducible revisions

- Baseline production tree: `f97188fdb4c3964bd47b556a904cd85e3142d06e`
- Candidate production tree: `1ca28da921c42155c14f75773b10bcfa42fdb7af`
- Benchmark and focused-test source: `771eceb54276342aac3b7d7134cb83da73230cbb`

The baseline ran in a detached worktree at the merge base. The benchmark and
focused-test commit was applied there without the production implementation,
so both revisions used the same benchmark code.

Measurements below were collected on the same host with Node 26 and Vitest
4.1.4. Focused cases ran separately with `NODE_ENV=production` to avoid one
case perturbing another:

```sh
pnpm exec vitest bench tests/client-load-sync.bench.ts --run \
  -t "<case>" --outputJson "<output>"
```

## Focused runtime benchmark

Times are milliseconds. Direct waits are averages of two alternating B/A and
A/B pairs. The synchronous `beforeLoad` case is the average of three pairs;
the remaining cases are one B/A smoke pair each.

| Case                                                              | Baseline mean | Candidate mean | Change | Baseline p75 | Candidate p75 | Baseline p99 | Candidate p99 |
| ----------------------------------------------------------------- | ------------: | -------------: | -----: | -----------: | ------------: | -----------: | ------------: |
| 80 waits for synchronous values                                   |        0.0279 |         0.0041 | -85.3% |       0.0275 |        0.0040 |       0.0526 |        0.0069 |
| 10 eager loaderless navigations                                   |        0.8379 |         0.8413 |  +0.4% |       0.9169 |        0.9283 |       1.6547 |        1.6749 |
| 10 retained loaderless navigations                                |        0.7642 |         0.7503 |  -1.8% |       0.8428 |        0.8184 |       1.4911 |        1.5279 |
| 10 navigations through 8 synchronous `beforeLoad` routes          |        1.0213 |         0.9277 |  -9.2% |       1.2095 |        0.9948 |       2.0927 |        2.0860 |
| 10 navigations through alternating sync/async `beforeLoad` routes |        0.9272 |         0.9119 |  -1.7% |       0.8982 |        0.8990 |       2.1566 |        1.9843 |
| 10 navigations through 8 resolved async `beforeLoad` routes       |        0.9174 |         0.9206 |  +0.3% |       0.8646 |        0.8775 |       2.0854 |        2.2611 |
| 10 navigations through 8 synchronous loader routes                |        1.3521 |         1.3677 |  +1.2% |       1.3683 |        1.3823 |       2.8341 |        2.8480 |

The direct bridge improvement repeated at -85.35% and -85.28% (about 6.8x).
The three synchronous-`beforeLoad` pairs all favored the candidate, at -7.54%,
-15.84%, and -4.00%. Its aggregate p99 was effectively unchanged, so the
result supports a central-path improvement rather than a long-tail claim.
Loaderless, fully asynchronous, and synchronous-loader cases remained close
enough to treat as smoke evidence only.

## Existing client-navigation scenario

The React `nested-params` scenario was rebuilt independently for each
production revision and run in B/A, A/B, B/A, A/B, and B/A order. It exercises
eight synchronous `beforeLoad` hooks together with parameter transforms,
context subscribers, and React rendering.

```sh
CI=1 NX_DAEMON=false pnpm nx run \
  @benchmarks/client-nav-nested-params-react:build:client \
  --outputStyle=stream --skipRemoteCache
NODE_ENV=production pnpm exec vitest bench \
  scenarios/nested-params/react/speed.bench.ts \
  --config scenarios/nested-params/react/vite.config.ts --run
```

| Pair | Baseline mean | Candidate mean | Change |
| ---: | ------------: | -------------: | -----: |
|    1 |        9.0056 |         9.1627 |  +1.7% |
|    2 |        7.3467 |         8.4679 | +15.3% |
|    3 |        7.4369 |         7.3747 |  -0.8% |
|    4 |        7.1931 |         7.5996 |  +5.7% |
|    5 |        7.1991 |         8.0636 | +12.0% |

The aggregate mean was 7.6363 ms for the baseline and 8.1337 ms for the
candidate (+6.5%); aggregate p75 and p99 moved +9.6% and +14.1%. Between-run
variation was much larger than each run's 0.27-0.70% RME, with paired changes
ranging from -0.8% to +15.3%. Four pairs favored the baseline, so this rerun
does not reproduce the previous broad end-to-end improvement. The inconsistent
magnitude prevents treating +6.5% as an exact regression, but the result is a
negative smoke signal that should remain visible alongside the focused win.

## Bundle size

Both revisions ran the complete bundle-size matrix with caches disabled:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/bundle-size:build \
  --outputStyle=stream --skipRemoteCache --skipNxCache
```

| Scenario                           | Gzip change | Initial gzip change |
| ---------------------------------- | ----------: | ------------------: |
| `react-router.minimal`             |        +4 B |                +2 B |
| `react-router.full`                |        -2 B |                 0 B |
| `solid-router.minimal`             |       +10 B |                +7 B |
| `solid-router.full`                |        +3 B |                +1 B |
| `vue-router.minimal`               |        +4 B |                +5 B |
| `vue-router.full`                  |        +4 B |                +2 B |
| `react-start.minimal`              |        +8 B |                +7 B |
| `react-start.deferred-hydration`   |         0 B |                +2 B |
| `react-start.full`                 |        +2 B |                +3 B |
| `react-start.rsbuild.minimal`      |        +6 B |                +6 B |
| `react-start.rsbuild.minimal-iife` |        +8 B |                +8 B |
| `react-start.rsbuild.full`         |        +2 B |                +2 B |
| `solid-start.minimal`              |        +7 B |                +4 B |
| `solid-start.deferred-hydration`   |        +5 B |                +3 B |
| `solid-start.full`                 |        +4 B |                +5 B |
| `vue-start.minimal`                |        +5 B |                +6 B |
| `vue-start.full`                   |        +2 B |                +3 B |

Every emitted scenario grew by 40 raw bytes. Total gzip changes ranged from
-2 B to +10 B; Brotli changes ranged from -89 B to +193 B.

## Correctness validation

- Focused router-core cancellation/adversarial tests: 26 passed.
- Router-core type tests: TypeScript 5.6, 5.7, 5.8, 5.9, 6.0, and 7.0 passed.
- Full bundle-size matrix completed successfully for both revisions.
