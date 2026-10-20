# Optimization result: PR 6631 serial cleanup

Historical source: `83e38a349dc5` plus the `load-client.ts` changes committed at
`ee5df0122640` and recorded in
`BUNDLE-SIZE.md` ("serial cleanup"). Node 26.10.0, pnpm 11.21.0. Benchmarks ran
through `@tanstack/router-core:test:unit` with `NODE_ENV=production` and
`NODE_OPTIONS=--conditions=development`, rebuilding through Nx for each side.

## Bundle size (`react-start.minimal`)

| Side   |   Gzip | Initial gzip |     Raw | Brotli | Run           |
| ------ | -----: | -----------: | ------: | -----: | ------------- |
| BEFORE | 99,714 |       99,574 | 311,434 | 86,664 | `cc-baseline` |
| AFTER  | 99,688 |       99,549 | 311,317 | 86,585 | `cc-final-v2` |

All 18 scenarios shrink: `cc-full-candidate` versus `cc-full-baseline`.

## Tests

The new tests (in `lifecycle-object-form-client.test.ts`,
`hydrate-lifecycle-transport.test.ts`, `context-returned-redirect.test.ts`) pass
BEFORE and AFTER: 128/128 in those files on both sides. Full router-core AFTER:
3,940 passed, 4 expected failures, 3 skipped.

## Benchmarks, single pass (mean latency, rme)

```
sync context revalidation, depth 4                13.34µs ± 3.7%  ->     13.07µs ± 3.5%    -2.0%
async context revalidation, depth 4               14.99µs ± 3.3%  ->     14.80µs ± 3.2%    -1.2%
sync context revalidation, depth 16               32.66µs ± 3.7%  ->     30.85µs ± 3.2%    -5.6%
async context revalidation, depth 16              43.47µs ± 4.7%  ->     38.95µs ± 3.0%   -10.4%
sync context revalidation, depth 32               59.78µs ± 3.4%  ->     56.90µs ± 2.6%    -4.8%
async context revalidation, depth 32              75.82µs ± 3.1%  ->     76.27µs ± 3.5%    +0.6%
client-load, depth 4                              11.60µs ± 5.8%  ->     11.74µs ± 5.9%    +1.3%
preload, depth 4                                  11.43µs ± 5.4%  ->     10.99µs ± 5.0%    -3.9%
async-client-load, depth 4                        13.28µs ± 4.5%  ->     13.57µs ± 4.5%    +2.2%
async-preload, depth 4                            13.29µs ± 4.2%  ->     13.15µs ± 4.3%    -1.1%
no-hook-client-load, depth 4                       9.63µs ± 6.2%  ->      9.28µs ± 5.8%    -3.6%
no-hook-preload, depth 4                           9.24µs ± 4.8%  ->      8.81µs ± 4.5%    -4.6%
raw, depth 4                                      14.19µs ± 3.7%  ->     13.84µs ± 3.1%    -2.5%
transformed, depth 4                              20.83µs ± 9.3%  ->     19.09µs ± 8.3%    -8.4%
transformed-async, depth 4                        19.74µs ± 7.8%  ->     20.05µs ± 8.2%    +1.6%
rerun, depth 4                                    16.26µs ± 6.0%  ->     16.60µs ± 6.4%    +2.1%
fallback, depth 4                                 34.47µs ± 6.7%  ->     33.68µs ± 6.3%    -2.3%
mixed, depth 4                                    17.37µs ± 7.2%  ->     17.34µs ± 6.7%    -0.2%
rerun-async, depth 4                              18.74µs ± 7.4%  ->     19.80µs ± 8.3%    +5.7%
assets-sync, depth 4                              18.99µs ± 6.7%  ->     20.27µs ± 7.2%    +6.7%
assets-async, depth 4                             22.18µs ± 8.4%  ->     21.47µs ± 8.1%    -3.2%
assets-mixed, depth 4                             22.30µs ± 8.5%  ->     20.93µs ± 7.6%    -6.1%
assets-sync-client-load, depth 4                  15.30µs ± 4.8%  ->     15.12µs ± 4.8%    -1.2%
assets-async-client-load, depth 4                 15.26µs ± 4.8%  ->     14.75µs ± 4.7%    -3.3%
assets-mixed-preload, depth 4                     14.18µs ± 4.1%  ->     13.68µs ± 4.1%    -3.5%
chunks-mixed, depth 4                             17.29µs ± 7.0%  ->     17.69µs ± 7.1%    +2.3%
chunks-ready, depth 4                             20.68µs ± 9.0%  ->     21.50µs ± 9.3%    +4.0%
chunk-fallback, depth 4                           18.10µs ± 7.0%  ->     18.80µs ± 9.8%    +3.9%
client-load, depth 16                             42.47µs ± 5.6%  ->     40.48µs ± 4.7%    -4.7%
preload, depth 16                                 33.16µs ± 3.1%  ->     33.01µs ± 3.2%    -0.5%
async-client-load, depth 16                       50.50µs ± 3.9%  ->     49.08µs ± 3.8%    -2.8%
async-preload, depth 16                           41.25µs ± 2.5%  ->     40.82µs ± 2.9%    -1.1%
no-hook-client-load, depth 16                     24.54µs ± 5.1%  ->     24.42µs ± 5.3%    -0.5%
no-hook-preload, depth 16                         22.16µs ± 3.9%  ->     23.54µs ± 9.2%    +6.2%
raw, depth 16                                     53.26µs ± 7.0%  ->     52.98µs ± 7.2%    -0.5%
transformed, depth 16                             53.45µs ± 6.5%  ->     56.30µs ± 7.0%    +5.3%
transformed-async, depth 16                       62.44µs ± 7.5%  ->     57.07µs ± 6.5%    -8.6%
rerun, depth 16                                   49.63µs ± 6.6%  ->     51.59µs ± 8.0%    +4.0%
fallback, depth 16                                90.16µs ± 5.9%  ->     90.85µs ± 5.8%    +0.8%
mixed, depth 16                                   50.58µs ± 6.9%  ->     48.27µs ± 6.3%    -4.6%
rerun-async, depth 16                             55.26µs ± 6.6%  ->     56.98µs ± 7.1%    +3.1%
assets-sync, depth 16                             61.29µs ± 6.0%  ->     61.12µs ± 6.3%    -0.3%
assets-async, depth 16                            59.40µs ± 5.9%  ->     61.26µs ± 6.2%    +3.1%
assets-mixed, depth 16                            60.43µs ± 5.8%  ->     61.53µs ± 6.3%    +1.8%
assets-sync-client-load, depth 16                 50.41µs ± 4.1%  ->     48.79µs ± 3.9%    -3.2%
assets-async-client-load, depth 16                49.25µs ± 4.1%  ->     48.87µs ± 4.3%    -0.8%
assets-mixed-preload, depth 16                    42.30µs ± 2.9%  ->     42.44µs ± 3.1%    +0.3%
chunks-mixed, depth 16                            54.54µs ± 6.5%  ->     63.38µs ± 8.5%   +16.2%
chunks-ready, depth 16                            55.55µs ± 6.6%  ->     53.96µs ± 6.3%    -2.9%
chunk-fallback, depth 16                          38.96µs ± 7.1%  ->     40.85µs ± 7.5%    +4.9%
```

Single-pass estimates have 3–9% RME; the largest increases needed narrower repeats. The four worst AFTER
cases were rerun alternately with `SERIAL_BENCH_TIME_MS=1500` (two rounds) and
`chunks-mixed` with 3000 ms (two more rounds, baseline first):

| Case                        | BEFORE means (µs)          | AFTER means (µs)           | Mean delta |
| --------------------------- | -------------------------- | -------------------------- | ---------: |
| `chunks-mixed, depth 16`    | 52.76, 53.48, 52.66, 54.09 | 53.81, 54.48, 50.88, 52.23 |     −0.75% |
| `no-hook-preload, depth 16` | 19.76, 19.92               | 20.09, 20.02               |      +1.1% |
| `transformed, depth 16`     | 52.26, 51.65               | 52.45, 52.67               |      +1.2% |
| `rerun, depth 16`           | 48.40, 48.77               | 49.27, 48.13               |      +0.2% |

Those reruns have rme 2.2–4.1%, so the differences are noise and order effects.
No regression is established. The change removes one finally pass and, for async
context followed by beforeLoad, one presented-store write per match.
