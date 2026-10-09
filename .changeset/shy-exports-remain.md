---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

Keep route exports intact under automatic code splitting: exported classes and `export { name as alias }` specifiers are retained like other exported route options, and the overload signatures of a function moved into the shared module no longer stay behind to shadow its import. Re-exports of the same name from different sources, such as `export { wrap as allowed } from './server'` next to `export { wrap as denied } from './client'`, now resolve to their own sources in the Start compiler.
