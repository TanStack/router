---
'@tanstack/start-plugin-core': patch
---

Fix the Rsbuild Start manifest dropping every route's stylesheets and preloads on Windows by normalizing rspack module paths to the POSIX form the generated route tree uses.
