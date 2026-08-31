# String handling in TanStack Router

All URL-path string encoding/decoding primitives live in
`router-core/src/string-encoding.ts`. ESLint (`no-restricted-globals` in that
package's eslint config) bans direct use of `encodeURIComponent`,
`decodeURIComponent`, `encodeURI`, `decodeURI`, `btoa` and `atob` anywhere else
in router-core `src/` (with two documented exceptions).

## Scope map: every encoding surface and where its guarantees are tested

| #   | Surface                                   | Package / file                                                                   | Tests                                                                            |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | URL path encode-on-write                  | `router-core/src/string-encoding.ts` (`encodePathParam`, `compileDecodeCharMap`) | `string-encoding.property.test.ts`, `path.test.ts`                               |
| 1   | href encoding                             | `encodePathLikeUrl`, `buildDevStylesUrl`                                         | `utils.test.ts`, property tests                                                  |
| 2   | URL path decode-on-read (attacker input)  | `decodePath`/`decodeSegment`; matcher `decodeParam` + `findMatch` choke point    | `malformed-percent.test.ts`, `string-encoding.property.test.ts`, `utils.test.ts` |
| 2   | prerender page validation (SSRF)          | `start-plugin-core/src/prerender.ts`                                             | `prerender-ssrf.test.ts`                                                         |
| 3   | search params                             | `router-core/src/qss.ts`, `searchParams.ts`                                      | `search-params.property.test.ts`                                                 |
| 4   | SSR inline scripts (XSS)                  | `escapeHtml` + scroll-restoration script; seroval stream factories               | `ssr-injection.test.ts`, `string-encoding.property.test.ts`                      |
| 5   | binary ↔ string (SSR streams, RPC frames) | `RawStream.ts`, `frame-protocol.ts`, client `frame-decoder.ts`                   | `frame-protocol.test.ts`, `frame-decoder.test.ts`                                |
| 6   | server-fn payload deserialization         | `start-server-core/server-functions-handler.ts`                                  | `server-functions-handler.test.ts`                                               |
| 7   | build-time base64url module IDs           | `start-plugin-core/import-protection/virtualModules.ts` (+rsbuild twin)          | `virtualModules-roundtrip.test.ts`                                               |
| 8   | persistence & headers                     | scroll-restoration JSON guards; early-hints Link headers                         | `scroll-restoration*.test.ts`, `early-hints-hardening.test.ts`                   |

## Trust boundaries and guarantees

| Function            | Input trust                         | Guarantee                                                                                                                |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `decodePath`        | attacker-controlled (URL)           | total: never throws; strips control chars, `"`, `<`, `>`, backtick, braces; collapses protocol-relative prefixes         |
| `encodePathParam`   | app data (params)                   | output safe for embedding in a single path segment                                                                       |
| `escapeHtml`        | app data (may contain user content) | output cannot break out of `<script>` text context                                                                       |
| `encodePathLikeUrl` | internally-decoded paths            | output contains no whitespace or non-ASCII characters; not fully encoded (ASCII specials pass through), hence unbranded  |
| `buildDevStylesUrl` | dev-only, internal route IDs        | n/a                                                                                                                      |
| frame decoder       | network bytes                       | size/count caps (16MiB/frame, 32MiB buffer, 1024 streams, 100k frames); unknown types and convention violations rejected |

## Malformed percent-encoding policy

A URL segment with malformed percent-encoding (e.g. `/post/%E4%BD`, `/post/%zz`,
`/post/%`) must never crash the router.

- `decodeParam` (string-encoding.ts) throws `URIError` on malformed input.
- `findMatch` (new-process-route-tree.ts) is the **single choke point** that
  converts that `URIError` into "no match". Every public matching entry point
  (`findRouteMatch`, `findFlatMatch`, `findSingleMatch`) funnels through it.
- Totality of all entry points is enforced by
  `tests/string-encoding.property.test.ts`; concrete regressions live in
  `tests/malformed-percent.test.ts`.
- The ESLint exception that permits `decodeParam` to exist is
  `tanstack/router-core/matching-decode-contract` in eslint.config.js.

## Branded string kinds

Percent-encoding is not idempotent: confusing an encoded string for a decoded one
produces double-encoded URLs, and vice versa. The brands make kinds distinct at
type level; they are erased at runtime (zero bundle cost) and extend `string`, so
consuming plain-string APIs stays free:

| Type               | Produced by       | Meaning                                   |
| ------------------ | ----------------- | ----------------------------------------- |
| `EncodedPathParam` | `encodePathParam` | percent-encoded single path-segment value |
| `DecodedPathParam` | `decodeParam`     | decoded param value extracted from a URL  |
| `EncodedPath`      | `interpolatePath` | full path with all params encoded         |
| `DecodedPath`      | `decodePath`      | decoded pathname (`location.pathname`)    |

`compileDecodeCharMap`'s decoder receives `EncodedPathParam`: custom decoders are
handed values produced by `encodeURIComponent` and may contain `%XX` sequences.

## Known issues / quirks (documented, deliberately not "fixed")

### `*` splat value collides with legacy wildcard syntax

A splat param value of `*` interpolates to `/files/*` — which is itself the legacy
wildcard syntax. Matching such a URL resolves to the legacy route node with empty
params instead of the `$` splat route carrying `_splat: '*'`. Reproduced in
`tests/malformed-percent.test.ts`. Fixing it requires encoding `*` as `%2A` in
splat interpolation _and_ preserving `%2A` through `decodePath` (alongside `%25`
/`%5C`); the latter changes static-segment matching for paths containing literal
encoded asterisks, so it needs dedicated e2e coverage before attempting.

### Search-param JSON coercion

The default search parser JSON-parses any value that could start valid JSON, so a
plain string `' 42'`, `'true'` or `'[1]'` changes type across a read. Long-standing
designed behavior; pinned in `search-params.property.test.ts`. Apps needing exact
strings must use custom search serialization.

### Early-hints `href` interpolation

`serializeEarlyHint` interpolates `href` verbatim between `<...>`. Attribute
values are injection-proof (token allowlist or quoted-string), but href comes
from the asset manifest — if user data ever reaches it, escaping must be added.
Pinned in `early-hints-hardening.test.ts`.

### Server-fn wire format

Server-function payloads are seroval JSON, not plain JSON. Plain JSON in a POST
body yields a 500 with the seroval error serialized — intentional (matches how
errors are surfaced elsewhere); covered in `server-functions-handler.test.ts`.
