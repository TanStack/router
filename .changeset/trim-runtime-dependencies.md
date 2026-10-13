---
'@tanstack/vue-router-devtools': patch
'@tanstack/solid-router': patch
'@tanstack/router-cli': patch
'@tanstack/start-plugin-core': patch
---

Trim runtime dependencies: `@tanstack/vue-router-devtools` no longer installs `vite`, `@tanstack/solid-router` drops the unused `@solid-primitives/refs`, the `tsr` CLI parses its arguments without `yargs`, and `@tanstack/start-plugin-core` writes `sitemap.xml` without `xmlbuilder2`.
