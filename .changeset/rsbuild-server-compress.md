---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

The Rsbuild plugin keeps the app's `server.compress` setting instead of always setting it to `false`. Compression stays off by default: a compressed streamed page reaches the browser only once the stream ends. The optional `@rsbuild/core` peer is now `^2.0.5`, the first version whose compression keeps SSR response headers intact.
