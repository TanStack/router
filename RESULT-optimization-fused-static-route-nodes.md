# Fuse static route-node construction

Baseline: `main` at `697ebb6ddbd433d052b6b4707938a5c595865d58`.

## Principle

When two private branches differ only in the key and collection they select,
make that selection once and share the identical lookup and construction work.
Keep the distinguishing names descriptive, and preserve a real branch when a
branchless expression has a measurable runtime cost.

The static route-segment paths previously duplicated node lookup, allocation,
parent/depth assignment, and map insertion for case-sensitive and
case-insensitive routes. The candidate selects the same descriptive `name` and
`staticChildren` map in one sensitivity branch, then performs that common work
once. No public API or emitted declaration changes.

## Bundle result

`react-router.minimal`:

| Metric         |    Before |     After | Change |
| -------------- | --------: | --------: | -----: |
| raw            | 275,591 B | 275,429 B | -162 B |
| initial raw    | 275,456 B | 275,294 B | -162 B |
| gzip           |  89,200 B |  89,164 B |  -36 B |
| initial gzip   |  89,058 B |  89,026 B |  -32 B |
| Brotli         |  77,742 B |  77,581 B | -161 B |
| initial Brotli |  77,635 B |  77,476 B | -159 B |

Because the router-core code is retained by every scenario, all 17 scenarios
improve by 162 raw bytes. Gzip improves in every scenario by 22–45 B, and
initial gzip improves by 22–44 B. Brotli ranges from -161 B to +43 B: nine
scenarios improve, one is unchanged, and seven have small compression
interactions despite containing 162 fewer raw bytes.

| Scenario                         |    Raw |  Gzip | Initial gzip | Brotli |
| -------------------------------- | -----: | ----: | -----------: | -----: |
| react-router.minimal             | -162 B | -36 B |        -32 B | -161 B |
| react-router.full                | -162 B | -32 B |        -35 B | -117 B |
| solid-router.minimal             | -162 B | -27 B |        -29 B |   +1 B |
| solid-router.full                | -162 B | -37 B |        -37 B |   -3 B |
| vue-router.minimal               | -162 B | -32 B |        -29 B |  +22 B |
| vue-router.full                  | -162 B | -33 B |        -34 B |  +21 B |
| react-start.minimal              | -162 B | -45 B |        -43 B |  -34 B |
| react-start.deferred-hydration   | -162 B | -44 B |        -44 B | -123 B |
| react-start.full                 | -162 B | -24 B |        -22 B |    0 B |
| react-start.rsbuild.minimal      | -162 B | -22 B |        -22 B |  -93 B |
| react-start.rsbuild.minimal-iife | -162 B | -22 B |        -22 B |  +43 B |
| react-start.rsbuild.full         | -162 B | -26 B |        -26 B |  -53 B |
| solid-start.minimal              | -162 B | -41 B |        -39 B |  +16 B |
| solid-start.deferred-hydration   | -162 B | -42 B |        -41 B |  -64 B |
| solid-start.full                 | -162 B | -41 B |        -40 B |  +27 B |
| vue-start.minimal                | -162 B | -32 B |        -33 B |   +1 B |
| vue-start.full                   | -162 B | -34 B |        -32 B |  -63 B |

Fresh paired full-matrix artifacts:

- exact base: `/private/tmp/router-bundle-baseline-full.json`
- final candidate at `0813b785db3540ff1ee1c73766e22fe3c41367da`:
  `/private/tmp/static-node-final-full.json`

## Attribution and runtime gate

The first fused form used two conditional expressions and measured 178 B raw /
43 B gzip smaller in `react-router.minimal`, but broad construction benchmarks
showed a possible slowdown on a sensitive route distribution. The final form
retains one explicit sensitivity branch. It gives back 16 raw bytes and 7 gzip
bytes in that scenario, materially improves the Brotli result, and removes the
questionable runtime result.

The focused benchmark constructs 256-route static-heavy trees in four
distributions, batching ten complete builds per sample. Median mean times across
three runs, in milliseconds per ten builds:

| Distribution       | Exact base | Candidate | Interpretation     |
| ------------------ | ---------: | --------: | ------------------ |
| insensitive/shared |     0.7998 |    0.7482 | ~6.5% faster       |
| insensitive/unique |     0.8291 |    0.7684 | ~7.3% faster       |
| sensitive/unique   |     0.7375 |    0.7303 | neutral/~1% faster |

The cross-case broad run was noisy for sensitive/shared construction, so that
case was isolated and repeated three times. Its median mean was 0.7450 ms on the
base and 0.7344 ms on the candidate; median p75 was 0.7479 vs 0.7476 ms, with
0.75–1.75% RME. It is therefore treated as neutral, not claimed as a speedup.
No distribution has a reproducible regression.

## Runtime and compatibility

- Case-sensitive and case-insensitive nodes still use distinct maps and the
  same respective key casing.
- The selected map is allocated lazily under the same condition as before.
- Lookup still precedes allocation, so shared prefixes reuse the same node.
- `fullPath`, `parent`, `depth`, and insertion order are unchanged.
- Route-level sensitivity overrides and route masks retain their behavior.
- No exports, public signatures, route options, node fields, module boundaries,
  annotations, or top-level effects change.

## Validation

- Focused static route-tree file: 172 passed.
- Router-core full unit suite: 1,526 passed and 3 expected failures; no Vitest
  type errors.
- Router-core type suite: all configured TypeScript versions from 5.6 through
  7.0 passed.
- Router-core ESLint: 0 errors; 26 pre-existing warnings.
- Generator CLI React e2e: 3 passed, covering a post page, nested pathless route,
  and not-found route.
- Full 17-scenario bundle-size matrix: passed.
- A focused static construction benchmark ran on both the exact base plus tests
  and final production candidate because router-core has no Nx `test:perf`
  target.
- Five independent reviews approved semantics, test adequacy, public API and
  tree-shaking safety, runtime evidence, bundle attribution, and publishability.
- Formatting and `git diff --check`: passed.

Focused tests cover differently cased insensitive siblings sharing a node while
retaining distinct children, the sensitive default with a route-level
insensitive override, and an uppercase route mask matched insensitively. The
benchmark also asserts the constructed map sizes and matching behavior before
timing each distribution.

## Integration note

Draft PR #7974 changes the same `parseSegments` switch. Whichever route-node
fusion lands second must be rebased carefully and have its focused benchmark and
full bundle matrix rerun; the independent byte attribution above should not be
carried across that rebase.
