---
'@tanstack/start-plugin-core': patch
---

RSC CSS HMR on Rsbuild needs `@rspack/core` >= 2.2.9: earlier versions can report a stale client build after a server component's CSS edit (web-infra-dev/rspack#15865), so the page keeps the old styles until the next edit. The peer ranges are unchanged.
