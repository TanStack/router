# Compact private boundaries

Baseline: `main` at `697ebb6ddbd433d052b6b4707938a5c595865d58`.

## Principle

When a value is constructed and consumed entirely inside one module or a
private framework context, prefer the smallest readable boundary for that
value: a labeled tuple, positional parameters, or the value itself instead of
a one-use wrapper object. Public options, component props, callbacks, browser
history state, and serialized HTTP data keep their existing shapes.

This change applies that rule to:

- coalesced browser-history actions,
- router-core's private lightweight match result,
- Solid's private nearest-match context,
- Vue's private Scripts and link helper inputs, and
- Start's private fetch-body result.

## Bundle result

All 17 scenarios improved in gzip, initial gzip, and raw JavaScript size.

| Scenario                           | gzip before → after | Initial gzip |    Raw | Brotli |
| ---------------------------------- | ------------------: | -----------: | -----: | -----: |
| `react-router.full`                |   93,079 → 93,058 B |        -23 B | -108 B | -158 B |
| `react-router.minimal`             |   89,200 → 89,162 B |        -34 B | -112 B |  -72 B |
| `react-start.deferred-hydration`   | 103,769 → 103,691 B |        -76 B | -161 B |  -35 B |
| `react-start.full`                 | 106,415 → 106,370 B |        -44 B | -161 B |  +42 B |
| `react-start.minimal`              | 103,012 → 102,952 B |        -62 B | -161 B |   +1 B |
| `react-start.rsbuild.full`         | 106,054 → 105,968 B |        -86 B | -163 B | -140 B |
| `react-start.rsbuild.minimal`      | 102,641 → 102,561 B |        -80 B | -163 B |  -34 B |
| `react-start.rsbuild.minimal-iife` | 103,059 → 102,982 B |        -77 B | -163 B | -121 B |
| `solid-router.full`                |   40,857 → 40,816 B |        -39 B | -181 B |  -58 B |
| `solid-router.minimal`             |   35,632 → 35,605 B |        -27 B | -171 B |  +12 B |
| `solid-start.deferred-hydration`   |   52,678 → 52,629 B |        -51 B | -223 B | -124 B |
| `solid-start.full`                 |   54,715 → 54,659 B |        -55 B | -234 B |  -41 B |
| `solid-start.minimal`              |   49,338 → 49,287 B |        -50 B | -223 B |  +21 B |
| `vue-router.full`                  |   59,444 → 59,356 B |        -89 B | -376 B |  -35 B |
| `vue-router.minimal`               |   53,346 → 53,282 B |        -63 B | -278 B |   -3 B |
| `vue-start.full`                   |   74,681 → 74,569 B |       -112 B | -425 B |  -26 B |
| `vue-start.minimal`                |   70,627 → 70,502 B |       -126 B | -425 B |  +52 B |

The ranges are -21 to -125 B gzip, -23 to -126 B initial gzip, and
-108 to -425 B raw. Brotli changed by -158 to +52 B; 5 of 17 scenarios
regressed slightly in Brotli despite improving in the primary gzip metric and
in raw size.

## Hunk attribution

Each production group was measured alone against the same baseline. The
scenario shown is the smallest representative bundle containing the group.

| Group                             | Scenario               |  gzip | Initial gzip |    Raw | Brotli |
| --------------------------------- | ---------------------- | ----: | -----------: | -----: | -----: |
| History queued action tuple       | `react-router.minimal` | -23 B |        -24 B |  -61 B | -130 B |
| Lightweight match tuple           | `react-router.minimal` | -11 B |        -10 B |  -51 B |   -4 B |
| Solid nearest-match tuple         | `solid-router.minimal` | -13 B |        -13 B |  -60 B |   -5 B |
| Vue Scripts tuple/direct inputs   | `vue-router.full`      | -25 B |        -26 B |  -96 B |  +14 B |
| Vue link positional helper inputs | `vue-router.minimal`   | -35 B |        -33 B | -168 B |  -37 B |
| Start fetch-body scalar result    | `react-start.full`     | -23 B |        -19 B |  -52 B |  -21 B |

For the Vue link group, href alone was -7 B gzip, href plus active state was
-29 B, and the complete href/active/style group was -35 B. Compression is
nonlinear, so isolated values do not add exactly to the composed result.

## Performance gate

A proposed internal LRU node tuple was excluded from this change. It saved
9 B gzip in isolation, but two direct benchmark runs showed approximately
22–24% lower eviction-churn throughput. Runtime performance takes precedence
over that size win.

The retained lightweight match tuple was benchmarked through cached and
uncached `buildLocation` calls:

| Workload        | Baseline run 1 | Candidate run 1 | Baseline run 2 | Candidate run 2 |
| --------------- | -------------: | --------------: | -------------: | --------------: |
| Cached source   |  456,242 ops/s |   460,718 ops/s |  457,658 ops/s |   455,549 ops/s |
| Uncached source |  301,365 ops/s |   300,952 ops/s |  302,925 ops/s |   300,540 ops/s |

The cached result moved in both directions across runs. The uncached result
was within 0.8% of baseline while its benchmark margin of error was about 3%,
so no material performance change was detected.

## Correctness and review

Focused browser-history tests cover replace→replace, replace→push,
push→replace, latest href/state selection, and rescheduling after an explicit
flush. The explicit-flush case drains the old microtask before queuing the next
action so it cannot pass via the earlier scheduled callback.

Validation passed:

- History unit tests: 29 passed, including the 4 new batching cases.
- Router-core unit tests: 1,523 passed and 3 expected failures.
- Solid Router client tests: 838 passed and 1 skipped; server tests: 3 passed.
- Vue Router unit tests: 814 passed and 1 skipped.
- Start client core unit tests: 80 passed.
- Type tests for all five affected packages across their configured TypeScript versions.
- ESLint for all five affected packages; no errors, existing warnings remain.
- React Start server-function E2E coverage for JSON POST, multipart upload,
  FormData serialization, FormData context, and direct FormData POST: 5 passed.
- Full 17-scenario bundle-size matrix.
- Five independent semantic, framework, core/performance, tree-shaking, and
  adversarial reviews; no remaining blockers.
