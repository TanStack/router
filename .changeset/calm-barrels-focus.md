---
'@tanstack/start-server-core': patch
'@tanstack/start-plugin-core': patch
'@tanstack/solid-start-server': patch
'@tanstack/vue-start-server': patch
---

Use focused server entrypoints for shared constants and handler helpers so build tooling and framework renderers do not traverse the full Start server barrel.
