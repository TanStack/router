---
'@tanstack/start-plugin-core': patch
---

Rsbuild: Start compiles the script blocks of Vue single-file components however vue-loader is set up: through `tools.rspack` (its rule and `VueLoaderPlugin`) instead of `@rsbuild/plugin-vue`, or with a plugin class of its own; with vue-loader's inline match resource their server code reached the client.
