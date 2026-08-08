# Shorter equivalent string operations

## Principle

Use `slice` instead of `substring` only when both bounds are proven non-negative and ordered. This change applies that rule to 24 calls. It does not change public options, return shapes, component props, serialized data, or user-visible behavior.

## Isolated attribution

Representative scenario: `react-router.minimal`, measured against `main` at `697ebb6ddbd433d052b6b4707938a5c595865d58`.

| Hunk                                |   Raw | Initial gzip |  Gzip | Brotli |
| ----------------------------------- | ----: | -----------: | ----: | -----: |
| Proven-range `substring` to `slice` | -88 B |        -10 B | -12 B | -110 B |

## Full bundle matrix

The candidate and control were built independently from the same exact base and dependency graph. The final slice-only candidate is recorded in `/tmp/native-slice-only-full.json`; gzip improves in all 17 scenarios.

| Scenario                         |   Raw | Initial gzip |  Gzip | Brotli |
| -------------------------------- | ----: | -----------: | ----: | -----: |
| react-router.minimal             | -88 B |        -10 B | -12 B | -110 B |
| react-router.full                | -88 B |        -11 B |  -7 B | -163 B |
| solid-router.minimal             | -88 B |        -11 B | -11 B |  +21 B |
| solid-router.full                | -88 B |         -2 B |  -2 B |  -10 B |
| vue-router.minimal               | -88 B |         -7 B |  -8 B |  -16 B |
| vue-router.full                  | -88 B |         -9 B |  -8 B |  -15 B |
| react-start.minimal              | -88 B |        -13 B | -14 B |   -1 B |
| react-start.deferred-hydration   | -88 B |        -15 B | -14 B | +102 B |
| react-start.full                 | -86 B |         +3 B |  -2 B |  +61 B |
| react-start.rsbuild.minimal      | -86 B |        -14 B | -14 B |  -77 B |
| react-start.rsbuild.minimal-iife | -86 B |        -12 B | -11 B |  -27 B |
| react-start.rsbuild.full         | -84 B |         -5 B |  -5 B |   +8 B |
| solid-start.minimal              | -88 B |        -13 B | -12 B |  +58 B |
| solid-start.deferred-hydration   | -88 B |        -15 B | -10 B |  -17 B |
| solid-start.full                 | -88 B |        -17 B | -17 B | -106 B |
| vue-start.minimal                | -88 B |        -24 B | -23 B |   +2 B |
| vue-start.full                   | -88 B |         -8 B |  -8 B |   +4 B |

Ranges:

- raw: -88 B to -84 B in all scenarios
- initial gzip: -24 B to +3 B; 16 improve and one regresses
- gzip: -23 B to -2 B in all scenarios
- Brotli: improves in ten scenarios and regresses by 2–102 B in seven

## Semantic constraints

Every changed `slice` bound comes from a fixed non-negative offset or parser offsets that are constructed in ascending order. The five parameter-extraction calls whose bounds can reverse remain `substring`: prefix/suffix overlaps can make value bounds cross, and Unicode lowercasing can expand an affix before name extraction. Focused tests preserve named, optional, and wildcard overlap behavior plus the Unicode length-expansion edge case.

`String.prototype.slice` is already used throughout the affected shipped packages, so this does not raise the browser-support floor.

## Validation

The focused router-core path suite passes with 361 tests and no type errors. Package-level unit validation also passes:

- history: 25 tests
- router-core: 1,528 passed and three expected failures
- React Router: 989 passed and one skipped
- Solid Router: 838 passed and one skipped

The initial combined unit command was stopped after its output stalled twice under the repository's execution guardrail; the package-level runs above completed against the exact candidate. Type tests pass for all four affected packages across TypeScript 5.6 through 7.0. ESLint reports no errors; remaining warnings are pre-existing.

The focused `path-string-operations.bench.ts` benchmark first compares the changed native operation directly and verifies that `slice` and `substring` return identical values for representative ordered bounds. Across four final runs, `slice` averaged 34,385.01 Hz versus 31,162.09 Hz for `substring`, a 10.34% improvement.

The same benchmark exercises href parsing, interpolation, route-tree construction, and search-prefix handling through their real APIs. Four bracketed exact-base/candidate pairs produced these average throughputs:

| Operation                         |   Exact base |    Candidate | Change |
| --------------------------------- | -----------: | -----------: | -----: |
| Parse 400 hrefs                   | 11,379.09 Hz | 11,560.88 Hz | +1.60% |
| Interpolate 300 path templates    |  3,691.13 Hz |  3,697.17 Hz | +0.16% |
| Construct a 30-route dynamic tree | 74,722.08 Hz | 75,369.98 Hz | +0.87% |
| Parse 400 search prefixes         |  7,100.11 Hz |  7,062.15 Hz | -0.53% |

The search-prefix result has no stable direction: the four paired deltas alternate between -4.54%, +2.05%, -1.75%, and +2.37%, while the directly changed operation is consistently faster. The other workflows are flat to positive. The repository's existing framework link benchmark could not provide a usable control: the React run exhausted its 4 GB heap after existing `act(...)` warnings, and the Solid run loaded a client-only API in server mode. The focused benchmark was added so performance validation would not depend on those unrelated failures.

## Rejected nearby variant

Five boolean `indexOf` probes were also tested as `includes`. That group saved 10 gzip bytes in `react-router.minimal`, but three isolated performance pairs ranged from -1.60% to +0.64% and averaged -0.23%. The result was not confidently neutral, so the group was dropped from the final candidate.

Five independent publication reviews cover semantic equivalence, adversarial bounds, browser support, public API behavior, tree-shaking, performance, tests, and measurement integrity. Their final disposition is recorded before publication.
