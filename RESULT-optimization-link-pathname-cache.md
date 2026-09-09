# Link pathname cache: dependency-based revision

Baseline production implementation: `c18e690814`. Tests and benchmark sources are committed separately in `73ce104784` and `ac868d9cc9`; production changes remain in the working tree. This report supersedes the earlier conservative implementation and its eligibility claims.

## Contract and behavior

The cache belongs to one mounted React link and survives search/hash/state/params prop changes. Individual options/params objects follow React's immutable-input convention; each call validates the actual pathname dependencies.

- Record every parameter read by interpolation, including absent optional parameters. Preserve `_splat` as the dependency and discard its deprecated `*` alias. There is no named-star guard or blanket optional-path exclusion.
- An early hit avoids path resolution, merging and interpolation when the source/destination, route tree, trailing-slash policy, decoder, plain input and effective path values match.
- Otherwise, run ordinary path resolution, parameter updaters, route matching and stringifiers, then compare the resolved template and parameter values. Stable callback output, concrete destinations, and equivalent relative destinations can hit here.
- Accessor-bearing params run through normal merging before comparison, including getters on keys outside the path. Object-valued parameters still interpolate because their string conversion can change.
- Search middleware/validation, search serialization, output rewrites, hash, state and masks continue to run. Mask builds use separate ordinary builds and cannot contaminate the main pathname slot. `leaveParams` bypasses interpolation caching; navigation retains its validation and development diagnostics.
- Unrelated router options do not invalidate the pathname. Route tree and decoder changes do; trailing-slash changes require path resolution before deciding whether interpolation can be reused.

## BEFORE

The unoptimized production source is unchanged from the earlier baseline. Its full 18-scenario bundle results and production React navigation measurements are reused. The expanded core benchmark is run with the implementation stashed, using exactly the same source as the candidate. Existing baseline core/React unit and type suites passed in an isolated worktree.

Navigation baseline: 202 persistent React links, eight navigations per sample; mean **4.8505 ms**, **206.16 Hz**, p99 **6.2805 ms**, p999 **10.5150 ms**, standard deviation **0.3882 ms**, RME **±0.35%**, **2062 samples**.

| Scenario                         |   Gzip | Initial gzip |    Raw | Brotli |
| -------------------------------- | -----: | -----------: | -----: | -----: |
| react-router.minimal             |  85772 |        85631 | 268336 |  74649 |
| react-router.full                |  89366 |        89225 | 280329 |  77791 |
| solid-router.minimal             |  33930 |        33801 |  98429 |  30609 |
| solid-router.full                |  38868 |        38745 | 113419 |  34988 |
| vue-router.minimal               |  50635 |        50507 | 141472 |  45775 |
| vue-router.full                  |  56393 |        56265 | 160117 |  50694 |
| react-start.minimal              |  98992 |        98855 | 311619 |  85862 |
| react-start.query-integration    | 106512 |       106372 | 338754 |  92287 |
| react-start.deferred-hydration   |  99733 |        98876 | 313008 |  86520 |
| react-start.full                 | 102226 |       102089 | 321585 |  88565 |
| react-start.rsbuild.minimal      | 102345 |       102170 | 322193 |  88258 |
| react-start.rsbuild.minimal-iife | 102757 |       102588 | 323152 |  88605 |
| react-start.rsbuild.full         | 105744 |       105569 | 332524 |  91211 |
| solid-start.minimal              |  47080 |        46951 | 140523 |  41897 |
| solid-start.deferred-hydration   |  50243 |        47030 | 148163 |  44763 |
| solid-start.full                 |  52283 |        52155 | 156278 |  46312 |
| vue-start.minimal                |  67186 |        67059 | 193548 |  59756 |
| vue-start.full                   |  71097 |        70969 | 206153 |  63175 |

Baseline raw reports: `/tmp/link-cache-base-bundle.json`, `/tmp/link-cache-base-perf.json`, `/tmp/link-cache-v6-base-micro.json`.

Expanded baseline core measurements (ms per 100 builds):

| Case                                     | Mean ms |    RME | Samples |
| ---------------------------------------- | ------: | -----: | ------: |
| uncached literal                         | 0.23342 | ±0.32% |    4285 |
| cached literal                           | 0.22957 | ±0.28% |    4357 |
| uncached inherited                       | 0.19704 | ±0.50% |    5076 |
| changing inherited params                | 0.19425 | ±0.38% |    5148 |
| uncached optional                        | 0.19561 | ±0.25% |    5113 |
| changing optional params                 | 0.19872 | ±0.59% |    5033 |
| uncached middleware                      | 0.24427 | ±0.98% |    4094 |
| cached middleware                        | 0.24281 | ±0.97% |    4119 |
| stable mixed slots                       | 0.21716 | ±0.39% |    4605 |
| cold literal slots                       | 0.23085 | ±0.96% |    4332 |
| optional supplied uncached               | 0.19846 | ±0.67% |    5039 |
| optional supplied cached                 | 0.19094 | ±0.32% |    5238 |
| optional absent uncached                 | 0.14033 | ±0.28% |    7127 |
| optional absent cached                   | 0.15339 | ±5.38% |    6520 |
| optional inherited unchanged uncached    | 0.17370 | ±0.27% |    5758 |
| optional inherited unchanged cached      | 0.17599 | ±0.71% |    5683 |
| inherited unchanged uncached             | 0.16945 | ±0.88% |    5902 |
| inherited unchanged cached               | 0.16949 | ±0.35% |    5900 |
| relative unchanged uncached              | 0.15694 | ±7.71% |    6372 |
| relative unchanged cached                | 0.14463 | ±0.65% |    6915 |
| updater unchanged uncached               | 0.16712 | ±0.68% |    5984 |
| updater unchanged cached                 | 0.16417 | ±0.30% |    6092 |
| stringifier unchanged uncached           | 0.20613 | ±0.73% |    4852 |
| stringifier unchanged cached             | 0.19866 | ±0.30% |    5034 |
| explicit mask uncached                   | 0.35140 | ±0.27% |    2846 |
| explicit mask cached                     | 0.36551 | ±0.78% |    2736 |
| mixed hits and changing inherited params | 0.19447 | ±0.73% |    5143 |

## AFTER

### Navigation benchmark

A refreshed baseline was measured immediately after the final candidate, on the same machine with the same production React scenario.

| Metric             | Refreshed baseline | Final candidate |
| ------------------ | -----------------: | --------------: |
| Mean               |          5.0077 ms |       3.0916 ms |
| Throughput         |        199.6926 Hz |     323.4599 Hz |
| p99                |          6.5276 ms |       4.3127 ms |
| p999               |         10.3628 ms |       9.2787 ms |
| Standard deviation |          0.4772 ms |       0.8113 ms |
| RME                |            0.4180% |         0.9043% |
| Samples            |          1997.0000 |       3235.0000 |

Mean time decreases **38.3%**, with **1.62× throughput**. Earlier full candidate runs measured about 3.40 ms, and the earlier baseline was 4.85 ms; these are local benchmark measurements with between-run variability, not universal application speedups. The scenario contains many persistent links with reusable destinations.

### Focused core benchmark

Milliseconds per 100 builds. All cases check cached/fresh equality before timing; supported warm cases additionally assert actual cache-entry reuse across locations. Baseline uses the same expanded benchmark source and ignores the private cache slot.

| Case                                     | Baseline ms | Candidate ms | Mean change | Candidate RME |
| ---------------------------------------- | ----------: | -----------: | ----------: | ------------: |
| uncached literal                         |     0.23342 |      0.23574 |       +1.0% |        ±0.29% |
| cached literal                           |     0.22957 |      0.06553 |      -71.5% |        ±0.22% |
| uncached inherited                       |     0.19704 |      0.19621 |       -0.4% |        ±0.29% |
| changing inherited params                |     0.19425 |      0.24063 |      +23.9% |        ±0.80% |
| uncached optional                        |     0.19561 |      0.19999 |       +2.2% |        ±0.81% |
| changing optional params                 |     0.19872 |      0.23823 |      +19.9% |        ±0.90% |
| uncached middleware                      |     0.24427 |      0.24465 |       +0.2% |        ±0.51% |
| cached middleware                        |     0.24281 |      0.07421 |      -69.4% |        ±1.43% |
| stable mixed slots                       |     0.21716 |      0.05937 |      -72.7% |        ±0.30% |
| cold literal slots                       |     0.23085 |      0.26474 |      +14.7% |        ±0.48% |
| optional supplied uncached               |     0.19846 |      0.19923 |       +0.4% |        ±0.49% |
| optional supplied cached                 |     0.19094 |      0.03378 |      -82.3% |        ±0.37% |
| optional absent uncached                 |     0.14033 |      0.14652 |       +4.4% |        ±0.25% |
| optional absent cached                   |     0.15339 |      0.03392 |      -77.9% |        ±0.20% |
| optional inherited unchanged uncached    |     0.17370 |      0.17174 |       -1.1% |        ±0.27% |
| optional inherited unchanged cached      |     0.17599 |      0.04298 |      -75.6% |        ±0.43% |
| inherited unchanged uncached             |     0.16945 |      0.16482 |       -2.7% |        ±0.20% |
| inherited unchanged cached               |     0.16949 |      0.04355 |      -74.3% |        ±1.23% |
| relative unchanged uncached              |     0.15694 |      0.14221 |       -9.4% |        ±0.21% |
| relative unchanged cached                |     0.14463 |      0.04264 |      -70.5% |        ±1.18% |
| updater unchanged uncached               |     0.16712 |      0.17017 |       +1.8% |        ±0.27% |
| updater unchanged cached                 |     0.16417 |      0.11279 |      -31.3% |        ±0.46% |
| stringifier unchanged uncached           |     0.20613 |      0.20665 |       +0.2% |        ±0.20% |
| stringifier unchanged cached             |     0.19866 |      0.15181 |      -23.6% |        ±0.90% |
| explicit mask uncached                   |     0.35140 |      0.37352 |       +6.3% |        ±0.25% |
| explicit mask cached                     |     0.36551 |      0.23904 |      -34.6% |        ±0.98% |
| mixed hits and changing inherited params |     0.19447 |      0.15242 |      -21.6% |        ±0.40% |

Using paired uncached/cached cases within the final run:

| Stable dependency case       | Uncached / cached throughput ratio |
| ---------------------------- | ---------------------------------: |
| optional supplied            |                              5.90× |
| optional absent              |                              4.32× |
| optional inherited unchanged |                              4.00× |
| inherited unchanged          |                              3.78× |
| relative unchanged           |                              3.34× |
| updater unchanged            |                              1.51× |
| stringifier unchanged        |                              1.36× |
| explicit mask                |                              1.56× |

“Stable mixed slots” deliberately keeps each slot's used params stable; the earlier benchmark called this mixed without noticing that its option/location cycles were correlated. “Mixed hits and changing inherited params” uses an independent location cycle so inherited dependencies really change. The latter improves about 22% over baseline. No production-app hit-rate percentage is inferred from these synthetic cases.

Cold and forced misses remain tradeoffs. Cold literal slots cost about 0.34 microseconds extra per build versus the expanded baseline. Constantly changing inherited/optional destinations cost about 0.40–0.46 microseconds extra per build; they do not benefit from pathname reuse. A subsequent ordinary literal hit saves substantially more than the first-build overhead. Some uncached cases vary by a few percent between runs; the cache is not claimed to accelerate no-slot calls. Stable optional microbenchmarks isolate interpolation work and are not equivalent to a 4–6× application-level improvement.

### Full bundle comparison

All 18 scenarios were built. Gzip is primary; initial gzip, raw, Brotli and per-file counts were also inspected. No scenario gained a JavaScript file. Most growth is in the main client chunk; changed import hashes can move a few compressed bytes in tiny lazy chunks.

| Scenario                         | Final gzip | Gzip delta | Initial gzip delta | Raw delta | Brotli delta |
| -------------------------------- | ---------: | ---------: | -----------------: | --------: | -----------: |
| react-router.minimal             |      86339 |       +567 |               +569 |     +1747 |         +570 |
| react-router.full                |      89955 |       +589 |               +592 |     +1744 |         +584 |
| solid-router.minimal             |      34474 |       +544 |               +546 |     +1700 |         +457 |
| solid-router.full                |      39433 |       +565 |               +560 |     +1700 |         +496 |
| vue-router.minimal               |      51188 |       +553 |               +555 |     +1703 |         +435 |
| vue-router.full                  |      56946 |       +553 |               +554 |     +1700 |         +554 |
| react-start.minimal              |      99559 |       +567 |               +565 |     +1735 |         +358 |
| react-start.query-integration    |     107087 |       +575 |               +576 |     +1730 |         +483 |
| react-start.deferred-hydration   |     100301 |       +568 |               +565 |     +1735 |         +439 |
| react-start.full                 |     102820 |       +594 |               +592 |     +1726 |         +514 |
| react-start.rsbuild.minimal      |     102924 |       +579 |               +579 |     +1819 |         +489 |
| react-start.rsbuild.minimal-iife |     103334 |       +577 |               +577 |     +1819 |         +610 |
| react-start.rsbuild.full         |     106311 |       +567 |               +567 |     +1819 |         +360 |
| solid-start.minimal              |      47653 |       +573 |               +574 |     +1700 |         +530 |
| solid-start.deferred-hydration   |      50798 |       +555 |               +555 |     +1700 |         +450 |
| solid-start.full                 |      52834 |       +551 |               +551 |     +1700 |         +529 |
| vue-start.minimal                |      67729 |       +543 |               +543 |     +1706 |         +487 |
| vue-start.full                   |      71647 |       +550 |               +551 |     +1694 |         +353 |

React minimal adds **567 gzip bytes (0.66%)**. Solid/Vue minimal add **544/553 gzip bytes** through shared core, without adapter wiring or a claimed framework-level benefit. This is larger than the previous rejected narrow cache (+257 React gzip bytes): broader dependency tracking and callback-preserving hits require more code.

### Attribution and limits

The core cache, optional-dependency tracking and React caller are one dependent production group. The early path improves ordinary immutable inputs; the late path preserves callbacks while recovering interpolation hits. Neither replaces search/rewrites with cached outputs. A mounted-link slot avoids invalidation from unrelated prop changes. It remains internal and is not added to click/preload options.

The final local candidates were measured separately: the dependency-based cache without the own-parameter constant flag; the constant flag; and setting the optional-tracking property only on cached interpolation options. The constant flag reduced supplied-optional warm builds from 0.04398 to 0.03444 ms/100 and explicitly absent optionals from 0.04216 to 0.03490 ms/100. It does not override inherited or getter dependencies: an independent callback review verified those conditions. The final no-slot options shape measured absent-optional uncached calls at 0.14652 ms/100 versus 0.15146 in the preceding candidate, while other cases varied. The corresponding React-minimal bundle attribution is v6: 86285 gzip / 269928 raw bytes, v7-target: 86330 gzip / 270069 raw bytes, final-v8: 86339 gzip / 270083 raw bytes. The final composed version was measured across all 18 scenarios.

Remaining deliberate constraints:

- Params objects are immutable React inputs. Dynamic values should be supplied through new props or callbacks; the cache does not promise to observe in-place mutation of a previously classified data object.
- Getter-bearing params and parameter callbacks execute before a late hit. Object-valued path parameters continue interpolating so string conversion remains observable.
- Concrete destinations still rematch their branch; optional/relative/updater/stringifier/masked destinations are not categorically excluded.
- Mask destinations are rebuilt separately, preserving their own callbacks and dependencies.
- Route collision diagnostics can be emitted on a cold development build and skipped on subsequent early hits; navigation's from-route diagnostics remain on its ordinary path.
- Solid/Vue need their own reactive dependency and performance validation before using this immutable-input cache. This change wires React only.

### Validation

Five independent reviews covered optional/splat/relative/mask semantics, callbacks, performance distributions, React concurrency and remaining build modes. Their concrete findings are addressed. The final constant flag received an additional callback/dependency review.

- Core unit suite: **113 files, 1725 passed, four expected failures**.
- React unit suite: **80 files, 1053 passed, one skipped**.
- Core/React type suites and ESLint passed; existing lint warnings remain.
- Browser tests: **React basic 24/24**, **React i18n Paraglide 13/13**.
- New coverage includes optional present/absent/inherited dependencies, explicit undefined/null, prefixes/suffixes, braced splats, relative sibling destinations, masks, updater/stringifier output changes, accessor effects, route updates, decoder/trailing-slash changes, search/hash prop changes, preload validation and a suspended React transition.
- Prettier and `git diff --check` passed. A changeset is included. No PR was created and the implementation remains uncommitted.

Final raw reports: `/tmp/link-cache-v8-micro.json`, `/tmp/link-cache-final-v8-nav.json`, `/tmp/link-cache-refreshed-base-nav.json`, `/tmp/link-cache-final-v8-bundle.json`. Verification logs: `/tmp/link-cache-final-v8-checks.log`, `/tmp/link-cache-final-v8-e2e.log`. Intermediate measurement files use `/tmp/link-cache-v6-*` and `/tmp/link-cache-v7-*`.
