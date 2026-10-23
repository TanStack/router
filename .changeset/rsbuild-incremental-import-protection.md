---
'@tanstack/start-plugin-core': patch
---

Speed up Rsbuild development rebuilds by checking import protection only for rebuilt modules and their importers when the previous scan was clean.
