# Compact Vue private reactivity

Baseline: `main` at `697ebb6ddbd433d052b6b4707938a5c595865d58`.

## Principle

Do not retain a reactive wrapper when its value or identity never escapes, and
do not allocate a computed tuple when the render that consumes it is already
driven by the same single reactive source.

This candidate applies that principle to private Vue Router implementation
details:

- the IntersectionObserver helper's callers discard its returned ref, so each
  watch execution can keep its observer in the cleanup closure that owns it;
- `MatchInner` can derive its match and remount key from one `activeMatch`
  snapshot in the render that consumes both, removing a computed and tuple; and
- the outer match subscription uses vue-store's exact default identity selector
  while retaining the explicit `Object.is` equality function. This last source
  simplification is kept only as part of the measured final composition, not as
  a standalone optimization rule.

No supported public API or emitted public declaration changes.

## Bundle result

`vue-router.full`:

| Metric         |    Before |     After | Change |
| -------------- | --------: | --------: | -----: |
| raw            | 165,676 B | 165,546 B | -130 B |
| initial raw    | 165,552 B | 165,422 B | -130 B |
| gzip           |  59,444 B |  59,405 B |  -39 B |
| initial gzip   |  59,312 B |  59,272 B |  -40 B |
| Brotli         |  53,331 B |  53,309 B |  -22 B |
| initial Brotli |  53,218 B |  53,192 B |  -26 B |

Only the four Vue scenarios change. Every affected scenario contains 130 fewer
raw and initial bytes and improves primary gzip and initial gzip size:

| Scenario           |    Raw |  Gzip | Initial gzip | Brotli | Initial Brotli |
| ------------------ | -----: | ----: | -----------: | -----: | -------------: |
| vue-router.minimal | -130 B | -38 B |        -35 B |  -20 B |          -41 B |
| vue-router.full    | -130 B | -39 B |        -40 B |  -22 B |          -26 B |
| vue-start.minimal  | -130 B | -43 B |        -45 B |  -50 B |          -53 B |
| vue-start.full     | -130 B | -32 B |        -33 B |  +25 B |           +7 B |

The other thirteen scenarios are byte-identical in raw, initial raw, gzip,
initial gzip, Brotli, initial Brotli, and JavaScript file count. The only
secondary compression regression is 25 B Brotli in `vue-start.full`, which
still contains 130 fewer raw bytes and improves by 32 B gzip.

Fresh paired full-matrix artifacts:

- exact base, SHA-256
  `a33ee6b69b6dec26bd3548b642cf5a6446c58743adb395d32623d57e498b02c6`:
  `/private/tmp/vue-blocker-final-control-full.json`
- final candidate at `205d3bac73af5c41f5bd45c56fb38253c5620507`,
  SHA-256
  `2ea24fb0d11d023b584a3b169c19f1c54eb07c499f189e70cd6ced0b882c88af`:
  `/private/tmp/vue-private-reactivity-final-full.json`

## Hunk attribution

All production stages were measured from the same exact base across the full
17-scenario matrix. In `vue-router.full`:

| Production stage                |    Raw |  Gzip | Initial gzip | Brotli |
| ------------------------------- | -----: | ----: | -----------: | -----: |
| Observer local only             |  -43 B | -20 B |        -20 B |  +57 B |
| Match derivation only           |  -89 B | -20 B |        -20 B |  +30 B |
| Default selector only           |   +2 B |  +1 B |          0 B |  +23 B |
| Observer + Match derivation     | -132 B | -39 B |        -39 B |  +78 B |
| Final composition with selector | -130 B | -39 B |        -40 B |  -22 B |

Compression is nonlinear. The default-selector source simplification is not an
isolated byte win, so its composition was compared explicitly across every
retained scenario before keeping it. Across the four Vue scenarios, adding it
to Observer + Match changes aggregate gzip from -151 B to -152 B, aggregate
initial gzip from -150 B to -153 B, and aggregate Brotli from +47 B to -67 B.
It costs 8 aggregate raw bytes and one gzip byte in `vue-start.full`, but repairs
the larger Brotli regressions in `vue-router.full` and `vue-start.minimal` and
produces the better overall compressed profile.

Attribution artifacts:

- observer only: `/private/tmp/vue-attrib-observer-only-full.json`
- Match derivation only:
  `/private/tmp/vue-attrib-match-derivation-only-full.json`
- default selector only:
  `/private/tmp/vue-attrib-default-selector-only-full.json`
- observer plus Match derivation:
  `/private/tmp/vue-attrib-observer-match-full.json`

## Composition gate

The first candidate also removed a Vue lazy-component loading ref and the same
unused observer return state in Solid. Both improved gzip in isolation, but the
full matrix exposed secondary regressions. Targeted subset builds on
`vue-start.minimal` selected the balanced final group:

| Subset                      |    Raw |  Gzip | Initial gzip | Brotli |
| --------------------------- | -----: | ----: | -----------: | -----: |
| Lazy state + Match          | -157 B | -50 B |        -50 B | +117 B |
| Vue observer + Match        | -130 B | -43 B |        -45 B |  -50 B |
| Lazy state + Vue observer   | -113 B | -47 B |        -49 B |  +63 B |
| Initial all-Vue composition | -200 B | -68 B |        -70 B | +133 B |

The lazy state hunk was therefore dropped. The Solid observer hunk was also
dropped: it saved 9–14 B gzip in Solid scenarios but produced a 97 B Brotli
increase in `solid-start.minimal`. Neither rejected hunk, nor its tests, appears
in the final branch.

## Runtime and compatibility

- Vue's observer `watchEffect` still depends only on the element and disabled
  state. Each execution creates and observes one instance; its cleanup closes
  over and disconnects that exact instance before rerun or unmount.
- The removed observer ref was written but never read by either shipped caller.
  The helper is not exported by the package entrypoint or export map.
- `MatchInner` reads the same latest match, passes the same route ID, loader
  dependencies, params, and search to `remountDeps`, and stringifies the same
  truthy result before the same status handling.
- `MatchInner` has no changing props, slots, or other reactive inputs, so normal
  rerenders remain active-match-driven. Any reactive values read inside a user
  `remountDeps` callback remain tracked by the render effect.
- The installed vue-store version uses identity as its default selector;
  `Object.is` remains the explicit equality function.
- No exports, component props, route options, module entrypoints, or top-level
  effects change.

The candidate removes one Vue ref and its writes, one computed and tuple
allocation, and one callsite lambda without adding loops, scans, listeners, or
DOM work. A synthetic benchmark would not resolve a semantic uncertainty and
was not warranted.

## Validation

- Focused final candidate: 2 files, 260 passed, no type errors.
- The same final tests on exact base: 2 files, 260 passed, no type errors.
- Vue Router full unit suite: 54 files, 816 passed and 1 existing skip; no type
  errors.
- Vue Router type suite: 17 files, 138 passed.
- Vue Router ESLint: 0 errors; 79 pre-existing warnings.
- Vue remount-dependencies e2e: 2 passed.
- Full 17-scenario bundle-size matrix: passed.
- Five independent exact-HEAD reviews approved Vue lifecycle/runtime semantics,
  public API and tree-shaking safety, test adequacy and parity, maintainability,
  bundle attribution, compression tradeoffs, and publishability.
- Formatting and `git diff --check`: passed.

Focused tests cover observer replacement, disabled cleanup, re-enabling,
unmount cleanup, latest remount inputs, stable-key instance reuse, and changed-key
remounting. The exact-base parity worktree is
`/private/tmp/router-vue-private-final-parity.38ntQk/worktree`.
