---
'@tanstack/solid-router': patch
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-start': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
---

Bump solid-js and @solidjs/web to ^2.0.0-rc.7 and @solidjs/vite-plugin to ^3.0.0-next.42 across the monorepo (with @rsbuild/plugin-solid ^2.0.0-rc.0 and @solidjs/babel-plugin ^2.0.0-rc.7 for the rsbuild/webpack paths). @tanstack/solid-start now hands Solid a native `Request` when the host provides a Request subclass (e.g. srvx's Node adapter): rc.7 buffers every server-function POST body through `new Request(request, { body })`, which undici only accepts for its own instances, so such hosts answered every POST with 400.
