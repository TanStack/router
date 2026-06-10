# 014 — port the server branch's `isActive` pre-checks to the client branch of Link

|                 |                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/react-router/src/link.tsx`, possibly `packages/router-core/src/utils.ts`                                               |
| Benchmarks      | client-nav (react)                                                                                                               |
| Expected impact | Small (deepEqual over search objects ×22 links per navigation) — but essentially free, and deduplication may _shrink_ the bundle |
| Confidence      | High (the exact logic already exists and runs in the SSR branch)                                                                 |
| Risk            | Very low                                                                                                                         |
| Prior art       | none found                                                                                                                       |

## Problem

Link computes `isActive` in two places with different cost profiles:

- **Server branch** (`link.tsx:244-266`): guards the search comparison with cheap pre-checks — `if (currentLocation.search !== next.search)` reference check plus empty-object short-circuits via `hasKeys` — before calling `deepEqual`.
- **Client branch** (`link.tsx:497-505`): calls `deepEqual(currentLocation.search, next.search, {partial: ...})` **unconditionally** for every link with `includeSearch` (the default) on every location change.

Since `next.search` is rebuilt per `buildLocation` (`nullReplaceEqualDeep` stabilizes it against the freshly built `fromSearch`, not against `currentLocation.search`), `deepEqual`'s internal `a === b` fast path (`utils.ts:371`) rarely hits, so the full walk runs for ~22 links on every navigation.

## Proposed approach

Hoist the server branch's pre-check logic into a small shared helper used by both branches:

- reference equality of the two search objects,
- `hasKeys` empty-object short-circuits,
- then the existing `deepEqual` with identical `partial`/`ignoreUndefined` flags.

Deduplicating the two implementations into one function likely produces a net-negative bundle delta, which can help pay for other findings' additions.

## Risks & constraints

- Semantics already proven by the SSR path (it exists for hydration parity) — keep the `exact`/`explicitUndefined` flags identical between branches.
- None beyond standard test coverage.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Focus tests: link active-state tests (`link.test.tsx`), activeOptions matrix (exact/includeSearch/includeHash), SSR hydration-parity tests.
