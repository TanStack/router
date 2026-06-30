---
'@tanstack/router-core': patch
---

fix(router-core): re-encode URL-unsafe characters in `sanitizePathSegment` to prevent infinite redirect loops

`sanitizePathSegment` now re-encodes characters in the WHATWG URL "path percent-encode set" (`<`, `>`, `"`, `` ` ``, `{`, `}`) and ASCII control characters back to their percent-encoded form, instead of stripping control characters. This prevents mismatches between the original URL and the router's internal representation that previously caused infinite 307 redirect loops on paths containing these characters (e.g. `/%7B%7Btemplate%7D%7D`).

Fixes #7587.
