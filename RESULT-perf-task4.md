# RESULT — perf/task4-parallel-head-scripts

## Change

`projectLane` evaluated each match's head/scripts(/headers) callbacks
sequentially — a `Promise.all` **per match** inside a sequential loop — so
total latency was the **sum** of all callback resolutions. Both implementations
now:

1. Walk the rendered prefix first (unchanged break conditions), invoking every
   qualifying match's head/scripts(/headers) callbacks synchronously **in route
   order** (identical invocation order to before).
2. Await and apply the results strictly **one match at a time in route order**,
   reusing the exact original per-match apply/error/abort/break logic.

Files:
- `packages/router-core/src/load-server.ts` (`projectLane`, head + scripts + headers)
- `packages/router-core/src/load-client.ts` (`exported projectLane`, head + scripts)

## Observable orderings enumerated, and how each is preserved

| # | Observable | Sequential behavior | Parallel implementation |
|---|------------|---------------------|--------------------------|
| 1 | Callback invocation order across matches | Match N's fns invoked after match N-1 applied | All fns invoked synchronously in route order before any await → same relative invocation order (proven by `invocationOrder` assertion in tests) |
| 2 | Result application order | Route order | Phase-3 loop awaits attempts strictly in route order; proven by test "applies results in route order even when later matches resolve first" (later heads resolved first; nothing applied until match 0 settles) |
| 3 | Early-break conditions (`ssr:false` / `status!=='success'` / `_notFound`; client: `status`/`_notFound`) | Checked per iteration, including matches without head options; stops invocation *and* application | Identical checks run in an identical prefix walk (invocation stops there); phase 3 re-runs the same check after each application so nothing is *applied* past a break boundary either. Proven by error-status, `_notFound`, and `ssr:false` tests |
| 4 | Which error surfaces when multiple reject | Per-match `Promise.all`: first rejection among head/scripts(/headers) wins for that match; errors logged in route order; processing continues after logging | Same per-match `Promise.all` grouping (same winner semantics); settle-all + process-in-route-order makes cross-match log order deterministic route order. Proven by "surfaces errors deterministically in route order" tests where match 1 rejects before match 0 but logs come out `[errMatch0, errMatch1]` |
| 5 | Sync throw from a user fn | Caught by the same per-match catch → logged, lane continues | Invocation wrapped in try/catch converting it to a rejection processed identically. Proven by "handles synchronous throws like rejections" test |
| 6 | Abort behavior | Server: `signal.throwIfAborted()` after each await (rejects projectLane before apply/log). Client: `waitFor` rejects with the signal → silent `break`, no log | Server: `throwIfAborted()` inside try on success path / first line of catch — identical outcomes. Client: identical `cause === signal && signal.aborted → break`. Discarded attempts past an abort-break carry a no-op catch. Proven by "breaks silently when aborted mid-flight and emits no unhandled rejection" |
| 7 | Unhandled rejections | None possible (every promise awaited or raced) | Every attempt gets `void attempt.catch(() => {})` attached immediately at creation, covering any attempt discarded by a mid-phase-3 break; awaited attempts consume their rejection via try/catch. Proven via `process.on('unhandledRejection')` assertions plus vitest's global unhandled-rejection detection over the whole 1619-test suite |
| 8 | Microtask/scheduling parity (user-visible commit ordering) | Publishes racing `load()` resolution won by deterministic margin | Critical subtlety discovered during verification: wrapping results in an extra `.then` layer added one microtask tick per match and flipped a real race (`runBackground`'s publish landed *after* `router.load()` resolved → stale meta observable; caught by existing `public-hydration-contract.test.ts`). Fixed by storing the raw attempt promise and awaiting it directly — byte-for-byte the same await chain depth as the original code. Test now passes |

## What intentionally changed (not user-visible)

- Head/scripts/headers fns for the whole rendered prefix are invoked up-front
  instead of drip-fed between awaits. Fns that read **other matches'**
  `meta`/`links`/… (results applied by earlier iterations) would observe
  not-yet-applied values. Practically unreachable: loaders complete before
  projection begins, and the existing contract test proving heads observe fresh
  cross-match `loaderData` passes. Documented as residual risk below.

## Verification evidence

- `pnpm nx run @tanstack/router-core:test:unit` → **107 files / 1616 passed,
  0 failed** (includes 10 new tests in `tests/head-scripts-parallel.test.ts`
  and the previously-regressing `public-hydration-contract.test.ts`).
- `pnpm nx run @tanstack/router-core:test:eslint` → 0 errors (26 pre-existing
  warnings in unrelated files).
- `pnpm nx run @tanstack/router-core:test:types` → pass (ts56–ts70 matrix).

### New tests (`packages/router-core/tests/head-scripts-parallel.test.ts`)

Client (`projectLane` exercised directly): route-order application with
reverse-resolution order; early-break on `status:'error'`; early-break on
`_notFound`; deterministic route-order error surfacing with continued
projection; sync-throw handling; silent abort break + no unhandled rejection;
N=4 × 80ms heads complete in < 240ms (sequential would need ≥ 320ms).

Server (via `loadServerResponse`): head/scripts/headers all applied per-match
with reverse-resolution order; `ssr:false` break boundary; route-order error
logging with 200 render.

### Timing evidence

Micro-benchmark (temporary vitest run, N=6 heads × 60ms sleep each):

```
[BENCH] N=6 delay=60ms | sequential(sum)=362ms | projectLane=62ms | theoretical max=60ms sum=360ms
```

Parallel evaluation tracks **max (~62ms ≈ 60ms)**, not sum (360ms) — a ~5.8×
reduction at N=6; SSR TTFB improves by roughly the sum of all but the slowest
head/scripts/headers resolution.

## Residual risks

1. Cross-match observation of applied head results inside later head fns
   (see above) — theoretically observable, practically nonexistent; loaders are
   guaranteed complete before projection, which is the documented contract.
2. Under abort, callbacks for later prefix matches are now invoked before the
   abort is observed (previously they were never invoked). Pure side-effect
   fns could notice extra invocations in aborted lanes only.
