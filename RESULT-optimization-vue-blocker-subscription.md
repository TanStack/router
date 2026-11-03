# Shared Vue blocker subscription

## Principle

When two public entry points implement the same private state machine, keep the
semantic differences at their boundaries and share the identical interior.

`useBlocker` and `<Block>` previously duplicated location conversion, resolver
state, history registration, cleanup, and navigation settlement. They now use
one private implementation. Boundary adapters preserve the hook's fixed option
snapshot and callback receiver while `<Block>` continues to read reactive props
and resubscribe.

## Scope and compatibility

- Public exports, overloads, props, and return types are unchanged.
- `useBlocker` still captures a fixed normalized option snapshot.
- `<Block>` still tracks reactive options and unsubscribes before resubscribing.
- Hook callbacks still receive `undefined` as `this`; `<Block>` callbacks retain
  their existing options-object receiver.
- Defaults still apply only to `undefined`; explicit `null` values pass through.
- History access, 404-to-valid-route bypass, resolver publication/reset,
  unsubscribe timing, error propagation, and pending-promise behavior are
  unchanged.

The production change is confined to `packages/vue-router/src/useBlocker.tsx`.

## Bundle-size result

Fresh paired full-matrix artifacts:

- exact base `697ebb6ddbd433d052b6b4707938a5c595865d58`:
  `/private/tmp/vue-blocker-final-control-full.json`
- clean final candidate `3c7c0184098880317fcc457a8d26fab51dcd6639`:
  `/private/tmp/vue-blocker-final-full.json`

Both runs used offline frozen installs with scripts disabled. All seven direct
benchmark `@tanstack` links and Vue Router's package-internal workspace links
were verified to resolve inside their intended worktrees before measurement.

| Scenario          |    Raw | Initial gzip |   Gzip | Brotli |
| ----------------- | -----: | -----------: | -----: | -----: |
| `vue-router.full` | -765 B |       -148 B | -148 B |  -29 B |
| `vue-start.full`  | -765 B |       -164 B | -163 B |  -47 B |

The other fifteen scenarios are byte-identical across raw, initial gzip, gzip,
and Brotli. In particular, `vue-router.minimal` remains identical because it
does not retain both blocker entry points. This confirms that the shared helper
does not leak across the tree-shaking boundary.

An independent clean `vue-router.full` attribution run at production commit
`08f4d624b60901ff0f3250cec42cf7290641f87c` reproduced the same `-765 B` raw,
`-148 B` gzip, and `-29 B` Brotli result in
`/private/tmp/vue-blocker-reviewed.json`.

## Runtime validation

An emitted-code benchmark compared the exact base with production commit
`08f4d624b60901ff0f3250cec42cf7290641f87c` using real Vue refs, computed
values, effects, scopes, and ticks. Correctness assertions covered location and
param conversion, the 404 bypass, hook versus component callback receivers,
registration, cleanup, and reactive resubscription.

Two independent full runs used 8 paired warmups and 96 measured AB/BA samples
per case. The synchronous-false invocation path was approximately 2.8-3.3%
faster for the hook and 2.4% faster for `<Block>`. Promise-false paths were
neutral to faster, and resubscription was neutral.

The only noisy case, `<Block>` setup, received two 160-pair confirmation runs.
Their geometric deltas were `+0.36%` (95% CI `-1.14..+1.89`) and `+0.20%`
(95% CI `-1.54..+1.96`), with paired medians converging toward zero. No tested
path showed a reproducible candidate-slower direction.

Full method, distributions, emitted-code hashes, script, and logs are under
`/private/tmp/vue-blocker-runtime-697ebb6d-08f4d624b6/`.

## Validation

- focused blocker suite: 14 passed, no Vitest type errors
- full Vue Router unit suite: 54 files, 818 passed, 1 skipped, no type errors
- Vue Router type suite: 17 files, 138 passed, no type errors
- Vue Router ESLint: 0 errors; 79 pre-existing warnings
- full 17-scenario bundle matrix: passed
- formatting and `git diff --check`: passed

Focused tests cover both entry points, `blocked -> reset/proceed -> idle`
resolver lifecycles, callback receivers, `null` versus `undefined` defaults,
reactive option changes, unsubscribe-before-resubscribe ordering, and unmount
cleanup.
