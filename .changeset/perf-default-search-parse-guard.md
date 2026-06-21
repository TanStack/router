---
'@tanstack/router-core': patch
---

perf: avoid a thrown `SyntaxError` per plain-string value in the default search parser. `defaultParseSearch` ran `JSON.parse` on every leftover string value (e.g. `?q=hello&f=live`), throwing and catching for the common non-JSON case. A cheap first-non-whitespace-char guard (a superset of JSON's value-start grammar, so results are identical) skips the doomed parse. Search params are parsed on every SSR request and every client navigation; ~1.7–3x faster on typical query strings.
