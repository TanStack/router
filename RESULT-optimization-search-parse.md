# Search parameter parsing measurements

Updated 2026-09-04. Node v25.8.1, pnpm 11.21.0, Vitest 4.1.4, macOS. The baseline is `main` at `ee283480df`, tested in a separate worktree with the same benchmark fixtures. The final implementation retains the PR’s original early-continue guard.

## Decision

Keep the `parser === JSON.parse` check at factory creation and the existing `jsonStart` prefix check before parsing each decoded string. This avoids exceptions for plain strings, preserves custom parser calls, and leaves malformed JSON on the existing catch path.

The proposed combined condition is equivalent, but saves raw bytes rather than gzip bytes in the measured React minimal bundle. An inverted boolean variant also increased gzip size. Both were rejected; the final measurement reproduces the original PR bundle exactly.

| React minimal variant      | Raw bytes | Gzip bytes | Initial gzip | Brotli bytes |
| -------------------------- | --------: | ---------: | -----------: | -----------: |
| Unoptimized main           |    268295 |      85752 |        85611 |        74687 |
| PR early continue          |    268345 |      85769 |        85630 |        74653 |
| Combined condition         |    268334 |      85773 |        85632 |        74681 |
| Combined, inverted boolean |    268333 |      85772 |        85632 |        74653 |
| Final retained version     |    268345 |      85769 |        85630 |        74653 |

## BEFORE: compatibility and timing

The final search-parameter test file was run against the baseline. All 86 compatibility cases passed. The optimization-specific spy case was marked `test.fails` in that temporary baseline worktree and failed as expected: without the guard, JSON.parse receives the ordinary strings. It runs as a normal passing test in the PR.

The previous spy test installed its spy after `defaultParseSearch` captured the original parser, so it could pass even without the guard. The corrected test creates a parser after installing the spy and also verifies that `{}` reaches the spy once.

## AFTER: public parsing benchmark

Each operation parses 1,000 query strings. Query strings are encoded with URLSearchParams before timing, including literal `+1`; output correctness is checked before the benchmarks. The separate custom-parser and encoded mixed-query cases supplement the default-parser fixtures. Mean and p99 are milliseconds per batch; RME is the reported relative margin of error. The noisy punctuation case was rerun alone for both implementations and those results replace the initial measurements below.

| Workload                                              | Before mean ± RME | After mean ± RME | Before / after samples | Before / after p99 | Speed ratio |
| ----------------------------------------------------- | ----------------: | ---------------: | ---------------------: | -----------------: | ----------: |
| custom search parser ordinary strings                 |      0.759 ±0.81% |     0.742 ±0.28% |              659 / 674 |      0.964 / 0.881 |       1.02× |
| custom search parser rejected strings                 |     10.845 ±0.49% |    10.628 ±0.49% |                47 / 48 |    11.412 / 11.151 |       1.02× |
| encoded mixed search with repeated keys               |     12.349 ±0.75% |     5.304 ±0.48% |                41 / 95 |     13.409 / 5.862 |       2.33× |
| ordinary string values                                |     12.474 ±3.36% |     0.663 ±0.18% |               41 / 755 |     15.045 / 0.730 |      18.82× |
| ordinary strings outside JSON-literal initials        |     14.432 ±2.40% |     0.706 ±0.17% |               35 / 708 |     18.975 / 0.766 |      20.43× |
| ordinary strings with JSON-literal initials           |     13.924 ±0.58% |     0.676 ±0.25% |               36 / 740 |     14.585 / 0.773 |      20.59× |
| empty string values                                   |     14.304 ±0.88% |     0.534 ±0.19% |               35 / 936 |     14.963 / 0.604 |      26.77× |
| ordinary strings with non-JSON punctuation starts     |     12.729 ±3.05% |     1.102 ±0.21% |               40 / 454 |     15.023 / 1.192 |      11.55× |
| ordinary f/n/t words outside JSON-literal prefixes    |     14.653 ±2.74% |     0.710 ±0.22% |               35 / 704 |     20.199 / 0.790 |      20.63× |
| application words with JSON-literal prefixes          |     14.213 ±0.81% |    14.507 ±0.55% |                36 / 35 |    15.058 / 15.147 |       0.98× |
| application words with complete JSON-literal prefixes |     10.830 ±1.81% |    11.264 ±2.08% |                47 / 45 |    14.154 / 15.675 |       0.96× |
| JSON-literal prefixes followed by punctuation         |     10.743 ±0.71% |    11.368 ±0.72% |                47 / 44 |    12.023 / 12.525 |       0.95× |
| JSON-compatible string values                         |      1.231 ±0.25% |     1.286 ±0.24% |              407 / 389 |      1.376 / 1.451 |       0.96× |
| mixed application values                              |      7.764 ±1.50% |     0.627 ±0.28% |               65 / 798 |      9.879 / 0.750 |      12.38× |
| primitives already converted by decode                |      0.755 ±2.69% |     0.675 ±0.25% |              663 / 742 |      2.161 / 0.814 |       1.12× |
| strings requiring JSON.parse                          |      1.057 ±0.41% |     1.080 ±0.25% |              474 / 464 |      1.237 / 1.237 |       0.98× |
| JSON with leading whitespace                          |      1.247 ±4.69% |     1.285 ±0.33% |              401 / 390 |      1.530 / 1.477 |       0.97× |
| malformed JSON retains original strings               |     14.769 ±0.88% |    14.666 ±0.80% |                34 / 35 |    15.742 / 16.207 |       1.01× |

The favorable ordinary-string fixture is about 19× faster; the encoded mixed fixture is about 2.3× faster. These are fixture-specific results, not claims about end-to-end application speed. Strings that pass the prefix check still pay for the check before parsing or throwing. Several such cases are measurably slower by roughly 2–6%; this cost should not be dismissed as noise. Canonical numbers and booleans are already converted by `decode`, so they do not exercise JSON.parse.

## Isolated guard comparison

Local mechanism benchmarks compared baseline, early continue, combined condition, and inverted boolean over identical decoded-value batches, verifying equality before timing. Each family ran separately. Results below are microseconds per 1,000 values; these isolate the guard and exclude URL decoding. They support retaining the existing code, but are not application-level speed estimates.

| Family   | Variant  | Mean µs |  SD µs |   RME | Samples |  p99 µs | p999 µs |
| -------- | -------- | ------: | -----: | ----: | ------: | ------: | ------: |
| ordinary | baseline | 3150.58 | 170.99 | 0.84% |     159 | 3846.25 | 4039.71 |
| ordinary | split    |   10.18 |   6.31 | 0.55% |   49102 |   21.50 |   37.75 |
| ordinary | combined |   10.22 |  11.79 | 1.02% |   48939 |   12.33 |   31.58 |
| ordinary | positive |    9.87 |   1.68 | 0.15% |   50681 |   12.21 |   21.96 |
| valid    | baseline |   36.12 |   4.92 | 0.23% |   13844 |   45.42 |  135.63 |
| valid    | split    |   45.01 |   3.36 | 0.14% |   11109 |   52.42 |   98.75 |
| valid    | combined |   46.33 |   5.66 | 0.23% |   10793 |   58.04 |  125.25 |
| valid    | positive |   44.49 |   2.52 | 0.10% |   11240 |   50.42 |   81.13 |
| throwing | baseline | 3097.89 | 120.79 | 0.60% |     162 | 3411.46 | 3552.62 |
| throwing | split    | 3078.00 | 124.42 | 0.62% |     163 | 3697.58 | 4179.33 |
| throwing | combined | 3263.35 | 115.64 | 0.56% |     154 | 3644.29 | 3712.17 |
| throwing | positive | 3332.09 |  91.53 | 0.44% |     151 | 3461.87 | 3501.33 |
| custom   | baseline |   18.80 |   4.76 | 0.30% |   26603 |   25.04 |  106.12 |
| custom   | split    |   20.53 |   4.53 | 0.28% |   24360 |   26.21 |  102.92 |
| custom   | combined |   20.06 |   4.04 | 0.25% |   24926 |   25.42 |   58.67 |
| custom   | positive |   21.16 |   8.87 | 0.53% |   23629 |   49.83 |  145.17 |

## Full bundle comparison

All 18 scenarios completed. The retained optimization adds 11–34 gzip bytes over main, with 50–53 additional raw bytes; no scenario changes its JS file count. The entire production change is one dependent group: factory identity capture plus the guard. Removing either makes the optimization ineffective or changes custom-parser behavior. The syntax-only alternatives were measured independently above and removed.

| Scenario                         | Before gzip | After gzip | Gzip delta | Initial gzip delta | Raw delta | Brotli delta | JS files |
| -------------------------------- | ----------: | ---------: | ---------: | -----------------: | --------: | -----------: | -------: |
| react-router.minimal             |       85752 |      85769 |        +17 |                +19 |       +50 |          -34 |        2 |
| react-router.full                |       89340 |      89363 |        +23 |                +20 |       +50 |          +41 |        2 |
| solid-router.minimal             |       33888 |      33922 |        +34 |                +31 |       +50 |          +62 |        2 |
| solid-router.full                |       38847 |      38863 |        +16 |                +20 |       +50 |          -23 |        2 |
| vue-router.minimal               |       50613 |      50631 |        +18 |                +19 |       +50 |          +64 |        2 |
| vue-router.full                  |       56373 |      56391 |        +18 |                +18 |       +50 |          -59 |        2 |
| react-start.minimal              |       98967 |      98991 |        +24 |                +25 |       +50 |          +66 |        2 |
| react-start.query-integration    |      106486 |     106508 |        +22 |                +24 |       +50 |         +119 |        2 |
| react-start.deferred-hydration   |       99714 |      99725 |        +11 |                +20 |       +50 |          -55 |        3 |
| react-start.full                 |      102202 |     102224 |        +22 |                +22 |       +50 |          +46 |        2 |
| react-start.rsbuild.minimal      |      102338 |     102353 |        +15 |                +15 |       +53 |          -76 |        2 |
| react-start.rsbuild.minimal-iife |      102752 |     102765 |        +13 |                +13 |       +53 |         +103 |        2 |
| react-start.rsbuild.full         |      105741 |     105753 |        +12 |                +12 |       +52 |          +69 |        2 |
| solid-start.minimal              |       47050 |      47071 |        +21 |                +22 |       +50 |          -55 |        2 |
| solid-start.deferred-hydration   |       50211 |      50235 |        +24 |                +26 |       +50 |          +31 |        3 |
| solid-start.full                 |       52262 |      52278 |        +16 |                +17 |       +50 |          -74 |        2 |
| vue-start.minimal                |       67163 |      67179 |        +16 |                +17 |       +50 |          +70 |        2 |
| vue-start.full                   |       71072 |      71089 |        +17 |                +18 |       +50 |          -24 |        2 |

## Validation

- `pnpm test:eslint --base=origin/main --outputStyle=stream --skipRemoteCache`: 32 affected projects passed.
- `pnpm test:types --base=origin/main --outputStyle=stream --skipRemoteCache`: 36 affected projects passed, including supported router-core TypeScript versions.
- `pnpm test:unit --base=origin/main --outputStyle=stream --skipRemoteCache`: 29 affected projects passed. Router-core: 108 files, 1,655 passed and 4 existing expected failures.
- `pnpm nx run tanstack-router-e2e-react-basic-file-based:test:e2e --outputStyle=stream --skipRemoteCache -- tests/search-params.spec.ts`: all 8 Chromium tests passed.
- `pnpm nx run @tanstack/router-core:test:unit --outputStyle=stream --skipRemoteCache -- bench tests/searchParams-parse.bench.ts --run --outputJson /tmp/search-params-parse.json`: completed on baseline and final implementations.
- `pnpm nx run @benchmarks/bundle-size:build --outputStyle=stream --skipRemoteCache`: all 18 scenarios completed on baseline and final implementations.
- All Nx commands used `CI=1 NX_DAEMON=false`. Formatting and `git diff --check` passed.

The old CodSpeed report on `b68a1bf` reported memory regressions and warned that runtime environments differed. These local timings do not resolve that remote check; a new CI run must be assessed separately.
