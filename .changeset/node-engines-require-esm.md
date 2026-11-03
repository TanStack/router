---
'@tanstack/router-cli': minor
'@tanstack/router-generator': minor
'@tanstack/router-plugin': minor
'@tanstack/router-utils': minor
---

Require Node `^20.19.0 || >=22.12.0` (was `>=20.19`), so the CommonJS builds can load ESM-only dependencies through `require(esm)`. Node 21 and Node 22.0–22.11 do not enable it by default, so they are no longer supported.
