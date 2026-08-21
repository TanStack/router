# RESULT — perf/task1-jsonstart-parse-gate

## Change

`packages/router-core/src/searchParams.ts` — `parseSearchWith` now captures
`const isJsonParser = parser === JSON.parse` once at factory time and skips the
try/catch `JSON.parse` attempt for string values that fail
`jsonStart = /^(?:\s|["[{\d-]|fa|nu|tr)/`, mirroring the existing optimization
in `stringifySearchWith`. Non-JSON custom parsers (public API) are completely
unaffected: the guard is gated behind `isJsonParser`.

## Correctness

- Old vs new implementations compared on all 11 bench input sets plus 45
  adversarial values (empty, whitespace-only, `"0"`, `"-"`, `"fa"`, `"nu"`,
  `"tr"`, `"false"`, `"null"`, `"tru"`, `"{"`, `[`, digits, unicode,
  leading-space strings, JSON fragments, etc.) with both `JSON.parse` and a
  custom parser: **all results deep-equal**.
- Behavior for `JSON.parse` is strictly identical: regex false positives
  (`"favorite"`, `"true_value"`, `"tru"` …) still enter the try/catch and fall
  through unchanged; only strings that cannot begin valid JSON skip the parse.

## Benchmark

`packages/router-core/tests/searchParams-parse.bench.ts` (new), mirroring
`searchParams.bench.ts`; each iteration parses 1,000 search strings via
`defaultParseSearch` (`parser === JSON.parse`). Vitest bench, Node v26.

hz = operations per second (one op = one 1,000-string batch); mean in ms; rme.

| Scenario                                             | hz before | mean before | rme    | hz after | mean after | rme    | speedup |
| ---------------------------------------------------- | --------: | ----------: | -----: | -------: | ---------: | -----: | ------: |
| ordinary string values                                |     67.16 |     12.68ms | ±2.29% | 1,182.63 |     0.83ms | ±0.25% | ~17.6x  |
| ordinary strings outside JSON-literal initials        |     63.50 |     15.36ms | ±1.19% | 1,084.15 |     0.91ms | ±0.20% | ~17.1x  |
| ordinary strings with JSON-literal initials           |     64.01 |     15.16ms | ±0.99% | 1,239.23 |     0.79ms | ±0.24% | ~19.4x  |
| empty string values                                   |     66.74 |     14.77ms | ±0.82% | 1,519.67 |     0.64ms | ±0.25% | ~22.8x  |
| non-JSON punctuation starts                           |     81.58 |     12.01ms | ±1.69% |   991.53 |     0.98ms | ±0.24% | ~12.2x  |
| f/n/t words outside JSON-literal prefixes             |     62.90 |     15.32ms | ±4.18% | 1,153.26 |     0.83ms | ±0.28% | ~18.3x  |
| application words with JSON-literal prefixes          |     64.04 |     15.36ms | ±0.84% |    59.56 |    16.53ms | ±0.74% | ~0.9x*  |
| words with complete JSON-literal prefixes (fa/nu/tr…) |     83.83 |     11.77ms | ±0.85% |    75.21 |    12.71ms | ±3.43% | ~0.9x*  |
| JSON-literal prefixes followed by punctuation         |     83.28 |     11.80ms | ±0.86% |    77.05 |    12.64ms | ±1.17% | ~0.9x*  |
| JSON-compatible string values                         |    845.08 |      1.17ms | ±0.24% |   794.92 |     1.22ms | ±0.73% | ~0.94x  |
| mixed application values                              |    116.46 |      8.45ms | ±0.84% | 1,226.90 |     0.80ms | ±0.26% | ~10.5x  |

\* Scenarios whose values pass the `jsonStart` regex still go through
try/catch as before; the small delta (~5–10%) is regex overhead plus run noise
and is within expected cost for keeping behavior strictly identical. The win:
typical application search params (plain words) parse **12–23x faster**.

## Tests / lint / types

- `@tanstack/router-core:test:unit`: **pass** (106 files, 1609 passed,
  typecheck clean)
- `@tanstack/router-core:test:eslint`: **pass** (0 errors; pre-existing `_err`
  unused-var warnings unchanged)
- `@tanstack/router-core:test:types`: **pass** (ts56–ts70)

New unit tests in `packages/router-core/tests/searchParams.test.ts`:

- `parse skips JSON.parse for strings that cannot begin valid JSON`
  (asserts `JSON.parse` spy never invoked)
- `parse still parses strings that pass the jsonStart guard`
- `parse applies the guard only when the parser is JSON.parse`
