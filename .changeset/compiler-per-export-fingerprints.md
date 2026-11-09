---
'@tanstack/router-utils': patch
---

Dev: a plan depends on the exports it reads of another module, not on that module's whole export list. Adding an export to a widely imported module (or changing one an importer doesn't use) no longer re-plans and re-transforms every importer: on a 1,500-route app, appending an export to a module every route imports went from about 6.7 s to 32 ms until the update.
