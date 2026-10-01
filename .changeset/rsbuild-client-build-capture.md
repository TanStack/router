---
'@tanstack/start-plugin-core': patch
---

Speed up the Rsbuild client build capture on apps with many chunks by reading the Rspack chunk graph once per build.
