# 025 — SSR: `findHtmlBoundary` scans every closing tag per chunk

|                 |                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/ssr/transformStreamWithRouter.ts` (server-only)                               |
| Benchmarks      | ssr (react) — small here (~0.3%); medium for chunk-heavy streaming pages                                |
| Expected impact | Small in the benchmark; medium for suspense-streaming apps with many chunks                             |
| Confidence      | Medium (code-read; not hot in this benchmark because it renders ~1 big chunk per request)               |
| Risk            | Low (server-only)                                                                                       |
| Prior art       | `reserveStreamFastPath` (`transformStreamWithRouter.ts:208-212`) already exists — extend, don't replace |

## Problem

- `transformStreamWithRouter.ts:70-125` — `findHtmlBoundary` walks **all** `</` occurrences in each app chunk backwards via repeated `lastIndexOf('</', …)` (`:75`), looking for `</body>` case-insensitively, even after the last valid closing tag is identified. Cost is O(number of closing tags) JS-loop iterations per chunk instead of one native scan.
- Used in the read loop at `:796-848` — every app chunk pays it.
- `noteBarrierMarker`'s `chunk.includes(TSR_SCRIPT_BARRIER_ID)` (`:561-566`) adds another full chunk scan until the barrier is seen.

The SSR benchmark renders with `progressiveChunkSize: Number.POSITIVE_INFINITY` (`renderRouterToStream.tsx:53,141`) → ~1 big chunk per request, so this is ~0.3% there. Real streaming apps (suspense boundaries, deferred data) produce many chunks and re-scan repeatedly.

## Proposed approach

Fast path first: a single forward `chunk.indexOf('</body')` — native, SIMD-accelerated. On miss, one backward `lastIndexOf('</')` + tag validation for the safe split point. Keep the current loop only as a fallback for mixed-case `</BODY>`:

- React/Solid/Vue renderers emit lowercase; user-injected HTML may not. Either probe both `'</body'` and `'</BODY'` with `indexOf`, or fall back to the case-insensitive loop only when a `<` followed by `/b|/B` exists past the last match.

## Risks & constraints

- Must preserve case-insensitive `</body>` detection exactly (current code handles `</BoDy>`).
- Must preserve the "safe split point" semantics for chunks that end mid-tag — that's the function's real job; the fast path only short-circuits the common whole-tag case.
- Server-only file: no client bundle pressure.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit   # transformStreamWithRouter tests
```

To see the real effect, also benchmark a streaming scenario (small `progressiveChunkSize` or a suspense-heavy page); consider adding such a variant to `benchmarks/ssr` as part of this work.
