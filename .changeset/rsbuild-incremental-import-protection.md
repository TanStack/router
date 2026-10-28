---
'@tanstack/start-plugin-core': patch
---

Speed up Rsbuild import protection. Scans read the imports of only those modules that can report a violation, skip violations that were already reported, and development rebuilds check only rebuilt modules and their importers.
