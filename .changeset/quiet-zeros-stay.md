---
'@tanstack/router-core': patch
---

Treat `0` and `false` as provided `_splat` values when interpolating paths. Only `undefined`, `null`, and `''` now omit a splat segment, matching how other path params are stringified.
