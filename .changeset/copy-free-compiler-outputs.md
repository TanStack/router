---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting, Hydrate virtual modules and the import protection rewrite edit the analyzed module instead of copying it first, which makes builds faster.
