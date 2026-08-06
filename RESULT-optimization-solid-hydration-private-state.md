# Compact deferred-hydration private state

Baseline: `main` at `697ebb6ddbd433d052b6b4707938a5c595865d58`.

## Principle

Use compact, descriptive shapes for private state that is repeated in emitted
code:

- shorten internal keys while keeping their meaning clear;
- use captured locals instead of allocating one-field state wrappers when the
  closure needs the binding rather than object identity; and
- use a labeled tuple for a private registry entry when named locals preserve
  readability at every use site.

The changes keep public names and declarations intact. The prefetch-controller
key shortening is Solid-only. The wait-state locals and visible-observer tuple
live in shared Start client core and retain the same React and Solid behavior.

## Bundle result

`solid-start.deferred-hydration`:

| Metric         |    Before |     After | Change |
| -------------- | --------: | --------: | -----: |
| raw            | 153,750 B | 153,389 B | -361 B |
| initial raw    | 145,503 B | 145,503 B |    0 B |
| gzip           |  52,678 B |  52,623 B |  -55 B |
| initial gzip   |  49,265 B |  49,265 B |    0 B |
| Brotli         |  46,967 B |  46,848 B | -119 B |
| initial Brotli |  43,864 B |  43,793 B |  -71 B |

The other sixteen scenarios are byte-identical across raw, initial raw, gzip,
initial gzip, Brotli, and initial Brotli. The initial chunk's raw and gzip sizes
are unchanged; its content hash reference to the deferred chunk changes, which
compresses 71 B smaller with Brotli.

Fresh paired full-matrix artifacts:

- exact base: `/private/tmp/vue-blocker-final-control-full.json`
- final candidate at `33f709a2f70330e65a3cbb15a731ee1f9fd825d1`:
  `/private/tmp/solid-hydration-final-full.json`

## Hunk attribution

Each production hunk was measured independently against the same exact-base
artifact in the scenario that retains the code:

| Production hunk               |    Raw |  Gzip | Brotli |
| ----------------------------- | -----: | ----: | -----: |
| Solid private controller keys | -177 B | -19 B |  +11 B |
| Hydration wait-state locals   |  -87 B | -26 B |  -33 B |
| Visible observer-entry tuple  |  -97 B | -12 B |  -38 B |
| Final composed candidate      | -361 B | -55 B | -119 B |

Compression is nonlinear, so the isolated results do not sum to the composed
result. Every hunk independently improves raw and primary gzip size. The small
isolated Brotli increase from the key rename disappears in the final composition.

## Runtime and compatibility

- The private Solid controller does not escape its component, cross an SSR
  boundary, or affect declarations.
- The wait helper keeps the same first-winner state machine for abort, hydrate,
  and prefetch. Its post-setup check still runs a cleanup returned after a
  synchronous finish exactly once.
- The observer registry is still keyed by normalized observer options and still
  shares one observer per key. Callback removal, per-element unobserve, final
  disconnect, registry deletion, and later recreation are unchanged.
- The implementation adds no loops, scans, listeners, or DOM work. The locals
  remove two wrapper allocations and their property reads; the tuple retains the
  same observer and element-map allocations. A synthetic microbenchmark would
  not represent the dominant browser observer work, so lifecycle unit tests and
  browser e2e coverage are the direct runtime validation.

## Validation

- Start client core focused lifecycle tests: 2 files, 6 passed against both the
  exact-base implementation and the candidate.
- Start client core full unit suite: 5 files, 86 passed, no Vitest type errors.
- Solid Start client full unit suite: 3 files, 8 passed, no Vitest type errors.
- Start client core and Solid Start client type suites: all configured TypeScript
  versions from 5.6 through 7.0 passed.
- Start client core ESLint: 0 errors; 44 pre-existing warnings.
- Solid Start client ESLint: passed without errors.
- Deferred-hydration e2e: 45 passed across Vite SSR, Rsbuild SSR, and Vite.
- Full 17-scenario bundle-size matrix: passed.
- Five independent reviews approved runtime semantics, observer lifecycle,
  retained-code attribution, publishability, and maintainability/test coverage.
- Formatting and `git diff --check`: passed.

Focused tests cover synchronous setup and cleanup, abort/hydrate/prefetch
first-winner behavior, cleanup exactly once, pre-aborted signals, same-key
observer sharing, multiple callbacks, per-element cleanup, final disconnection,
and registry recreation.
