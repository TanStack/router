---
'@tanstack/start-plugin-core': patch
---

The Rsbuild plugin keeps the app's `server.compress` setting instead of always setting it to `false`. Compression stays off by default: a compressed streamed page reaches the browser only once the stream ends.
