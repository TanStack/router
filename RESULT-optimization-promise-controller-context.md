# Synchronous client-lane optimization

## Reproducible revisions

- Baseline production tree: `63d2cc9155ff5374112f7d067d0b278bafeb8486`
- Candidate production patch ID: `b9099aa30dc1b86af60761c00a74d334386b5053`
- Benchmark source: `packages/router-core/tests/client-load-sync.bench.ts`

The baseline was measured from `main` after the retained-pending and
no-navigation-rollback changes. The focused benchmark file was added before the
production implementation, so baseline and candidate used identical benchmark
code. The candidate patch ID covers only the production change in
`packages/router-core/src/load-client.ts`.

Measurements were collected on the same host with Node 26.4.0 and Vitest 4.1.4.
Focused cases ran in separate processes with `NODE_ENV=production` so one case
could not perturb another:

```sh
pnpm exec vitest bench tests/client-load-sync.bench.ts --run \
  -t "<case>" --outputJson "<output>"
```

## Focused runtime benchmark

Times are milliseconds. Synchronous raw waits and synchronous `beforeLoad` are
averages of three baseline and three candidate runs. The deliberately
unfavorable resolved-Promise case averages seven baseline and seven candidate
runs. The remaining cases are one-pair controls.

| Case                                                              | Baseline mean | Candidate mean | Change | Baseline p75 | Candidate p75 | Baseline p99 | Candidate p99 |
| ----------------------------------------------------------------- | ------------: | -------------: | -----: | -----------: | ------------: | -----------: | ------------: |
| 80 waits for synchronous values                                   |        0.0246 |         0.0038 | -84.4% |       0.0245 |        0.0039 |       0.0304 |        0.0052 |
| 80 waits for an already-resolved Promise                          |        0.0241 |         0.0241 |  -0.1% |       0.0241 |        0.0240 |       0.0303 |        0.0319 |
| 10 eager loaderless navigations                                   |        0.6554 |         0.6469 |  -1.3% |       0.6486 |        0.6421 |       1.1804 |        1.1301 |
| 10 retained loaderless navigations                                |        0.5850 |         0.5890 |  +0.7% |       0.5860 |        0.5893 |       0.9804 |        1.0414 |
| 10 navigations through 8 synchronous `beforeLoad` routes          |        0.7379 |         0.7015 |  -4.9% |       0.7314 |        0.6955 |       1.2458 |        1.2393 |
| 10 navigations through alternating sync/async `beforeLoad` routes |        0.7573 |         0.7179 |  -5.2% |       0.7494 |        0.7120 |       1.2824 |        1.2651 |
| 10 navigations through 8 resolved async `beforeLoad` routes       |        0.7438 |         0.7431 |  -0.1% |       0.7328 |        0.7323 |       1.2467 |        1.3219 |
| 10 navigations through 8 synchronous loader routes                |        1.0519 |         1.0481 |  -0.4% |       1.0352 |        1.0226 |       1.7834 |        1.7323 |

The direct bridge improves by 84.4%, about 6.4x. The synchronous
`beforeLoad` case improves by 4.9% in mean time and at p75, while p99 is
effectively unchanged. The mixed case moves in the expected direction.
The resolved-Promise case receives no fast-path benefit and pays the new
classification check on every call. It is flat at -0.1% mean and -0.2% p75.
Its aggregate p99 is +5.1% because one of seven candidate runs had a high-tail
outlier; the other six remained within the baseline range. Loaderless,
retained, fully asynchronous, and synchronous-loader controls are one-pair
smoke evidence only.

## Existing client-navigation scenario

The React `nested-params` scenario was rebuilt independently for each
production revision and run in baseline/candidate, candidate/baseline,
baseline/candidate, candidate/baseline, and baseline/candidate order. It
exercises eight synchronous `beforeLoad` hooks together with parameter
transforms, context subscribers, and React rendering.

These broad runs used the initial Promise normalization and exact callable-then
classifier. The final direct-Promise form selects the same raw-value branch for
this scenario; its focused runtime and full bundle measurements were rerun above
and below.

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
|    1 |        7.2933 |         7.1181 |  -2.4% |
|    2 |        7.1188 |         7.0457 |  -1.0% |
|    3 |        7.2006 |         7.3113 |  +1.5% |
|    4 |        7.1551 |         7.0256 |  -1.8% |
|    5 |        7.2387 |         7.0659 |  -2.4% |

The aggregate mean is 7.2013 ms for the baseline and 7.1133 ms for the
candidate (-1.22%). Aggregate p75 moves -0.86% and aggregate p99 moves -4.33%.
Four of five pairs favor the candidate, but paired mean changes range from
-2.4% to +1.5% and individual high-tail outliers remain visible. This is a
positive smoke signal, not a precise end-to-end performance claim.

## Bundle size

Both revisions ran the complete bundle-size matrix with caches disabled:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/bundle-size:build \
  --outputStyle=stream --skipRemoteCache --skipNxCache
```

| Scenario                           | Gzip change | Initial gzip change |
| ---------------------------------- | ----------: | ------------------: |
| `react-router.minimal`             |        +1 B |                -1 B |
| `react-router.full`                |         0 B |                +1 B |
| `solid-router.minimal`             |        +6 B |                +1 B |
| `solid-router.full`                |        -1 B |                 0 B |
| `vue-router.minimal`               |        -1 B |                -3 B |
| `vue-router.full`                  |        -1 B |                +1 B |
| `react-start.minimal`              |        +4 B |                +2 B |
| `react-start.deferred-hydration`   |        -1 B |                +1 B |
| `react-start.full`                 |        -2 B |                 0 B |
| `react-start.rsbuild.minimal`      |        -1 B |                -1 B |
| `react-start.rsbuild.minimal-iife` |        -1 B |                -1 B |
| `react-start.rsbuild.full`         |        -2 B |                -2 B |
| `solid-start.minimal`              |        +3 B |                 0 B |
| `solid-start.deferred-hydration`   |        +3 B |                 0 B |
| `solid-start.full`                 |        -2 B |                -1 B |
| `vue-start.minimal`                |        +1 B |                +2 B |
| `vue-start.full`                   |        +1 B |                 0 B |

Every emitted scenario shrinks by 7 raw bytes. Total gzip changes range from
-2 B to +6 B; Brotli changes range from -148 B to +117 B.

## Correctness validation

- Focused `waitFor` and client-lane adversarial tests: 30 passed.
- Router-core unit suite: 1,593 passed, 3 expected failures.
- Router-core type tests: TypeScript 5.6, 5.7, 5.8, 5.9, 6.0, and 7.0 passed.
- Router-core ESLint: 0 errors, 26 existing warnings.
- Changeset status validation passed.
- Full bundle-size matrix completed successfully for both revisions.
