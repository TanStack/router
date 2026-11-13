---
'@tanstack/start-plugin-core': patch
---

RSC CSS HMR on Rsbuild needs `@rspack/core` >= 2.2.9: earlier versions can report a stale client build after a server component's CSS edit (web-infra-dev/rspack#15865), so the page keeps the old styles until the next edit. Start's `@rsbuild/core` peer range is `^2.2.13`, which brings Rspack 2.2.9 (see the peer range changeset).
