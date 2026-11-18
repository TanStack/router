---
'@tanstack/start-plugin-core': patch
---

Rsbuild: fix the Rsbuild plugin build after two changes to its virtual modules crossed. Without this fix the package does not build, so no release could ship it. The Rsbuild dev manifest is written to its virtual module under the app's root.
