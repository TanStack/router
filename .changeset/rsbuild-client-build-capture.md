---
'@tanstack/start-plugin-core': patch
---

Speed up Start manifest generation for Rsbuild client builds with many chunks by caching Rspack chunk graph reads and only scanning chunks that contain route-split or hydration modules.
