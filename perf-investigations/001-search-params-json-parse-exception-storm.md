# 001 — search-params JSON.parse exception storm

|                 |                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/searchParams.ts` (shared client+server)                                                                                                                                                                      |
| Benchmarks      | ssr (react) **and** client-nav (react)                                                                                                                                                                                                 |
| Expected impact | **Large** — validated −42% SSR request time; `stringifyValue` is 5.7% self-time of the client-nav profile and the largest single router-core frame                                                                                     |
| Confidence      | High (CPU-profiled on both benchmarks; SSR fix validated experimentally with byte-identical HTML output)                                                                                                                               |
| Risk            | Low                                                                                                                                                                                                                                    |
| Prior art       | `origin/flo/search-params-json-parse-guard` (**most recent**, includes review feedback + tests), `origin/refactor-router-core-stringify-parse-search-json-perf` (older alternative) — **inspect/rebase these before writing new code** |

## Problem

The default search serializers use "try to JSON.parse it" as a type probe for every string value:

`searchParams.ts:63-81` (`stringifyValue` inside `stringifySearchWith`):

```ts
} else if (hasParser && typeof val === 'string') {
  try {
    // Check if it's a valid parseable string.
    // If it is, then stringify it again.
    parser(val)
    return stringify(val)
  } catch (_err) {
    // silent
  }
}
```

`parseSearchWith` (`searchParams.ts:~31-40`) has the symmetric `try { query[key] = parser(value) } catch {}` per string value.

`parser` is `JSON.parse`. For any ordinary string (`'all'`, `'group-0'`, `'updater-2'`, `'q-abc123'`), **a real SyntaxError is constructed, thrown, and swallowed**. V8 error construction + stack capture ≈ 2.5 µs vs ~43 ns for a successful parse vs ~18 ns for a regex pre-check (micro-benchmarked).

## Why it's hot

- `stringifySearch` runs once per `buildLocation` (`router.ts:2009`). Every mounted `<Link>` calls `buildLocation` when the location changes (`react-router/src/link.tsx:410-413`), so the client-nav benchmark (≈22 links) does ~23 stringify passes per navigation, each throwing for every plain-string param. `parseSearch` adds a parse+stringify round trip per `parseLocation` (`router.ts:1309-1310`).
- On the server, each SSR request renders all Links → measured **35.0% self time** for `stringifyValue` in the SSR benchmark profile (1140 ms of 3.26 s over 3000 requests).
- Thrown `Error` objects also feed GC (8.6% of client profile).

## Validated result

An ESM-loader patch applying the pre-check to the built SSR bench: **0.957 → 0.557 ms/request (−42%)**, HTML byte-identical. Client micro-bench of `encode()` on the benchmark's search shape: 714 ms → 20.6 ms per 100k calls (~35×).

## Proposed approach

Add a cheap first-character pre-check before attempting `JSON.parse`. A string can only be valid JSON if its first non-whitespace char is one of `" { [ - 0-9 t f n` (true/false/null):

1. In `stringifyValue`: skip the `parser(val)` probe (and return `val` directly) when the pre-check fails.
2. In `parseSearchWith`'s value loop: keep the string as-is when the pre-check fails.
3. Strings that _pass_ the pre-check but are still invalid JSON (`'1abc'`, `'true123'`) keep the existing try/catch — behavior is byte-identical.
4. **Scope the fast path to the default JSON implementations** (build it into `defaultParseSearch`/`defaultStringifySearch`, or gate on `parser === JSON.parse`) so custom serializers (JSURL, zipson…) keep exact semantics.

Note: leading whitespace must count as "could be JSON" (`JSON.parse(' 1')` succeeds), so test the first _non-whitespace_ char or include `\s` in the class: `/^[\s"{[\-\dtfn]/`.

## Risks & constraints

- Pre-check must be a strict **superset** of valid JSON starts — never reject a parseable string.
- ~40-60 bytes added to shared client code; CI gzip check applies. This is the one finding where a tiny bundle increase is clearly worth it (it also cuts client CPU), but run the bundle benchmark and report the delta.
- An optional second step explored during the audit — replacing `URLSearchParams` in `qss.ts encode` with manual `encodeURIComponent` concatenation — changes space encoding (`+` vs `%20`) and should be treated as a separate, lower-priority investigation.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit   # searchParams.test.ts has coverage; the prior-art branch adds ~75 lines of tests
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Expect a large, unambiguous SSR win and a visible client-nav win. The SSR bench must run with `NODE_ENV=production`.
