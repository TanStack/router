---
'@tanstack/router-core': patch
---

Fix infinite redirect loop on requests whose pathname contains encoded URL-unsafe ASCII characters (e.g. `<`, `>`, `"`, `` ` ``, `{`, `}`). `encodePathLikeUrl` now percent-encodes the WHATWG URL "path percent-encode set" so it round-trips with `decodePath` and the SSR redirect comparator no longer sees the URL as having changed.
