---
'@tanstack/start-plugin-core': patch
---

Speed up Rsbuild development rebuilds by reusing the client manifest when a rebuild cannot change it, which is typical for code-only edits.
