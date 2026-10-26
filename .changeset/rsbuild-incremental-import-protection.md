---
'@tanstack/start-plugin-core': patch
---

Speed up Rsbuild import protection. Scans read the imports of only those modules that can report a violation, and development rebuilds after a clean scan check only rebuilt modules and their importers.
