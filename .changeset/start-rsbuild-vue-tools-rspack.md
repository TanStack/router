---
'@tanstack/start-plugin-core': patch
---

Rsbuild: Start compiles the script blocks of Vue single-file components when vue-loader is set up through `tools.rspack` (its rule and `VueLoaderPlugin`) instead of `@rsbuild/plugin-vue`; with vue-loader's inline match resource their server code reached the client.
