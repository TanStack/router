---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Add support for Rsbuild client output formats, including module output by default and IIFE output for classic script environments.

Client entry scripts and preloads are now represented as root route manifest assets, script preloads follow the manifest script format, and script asset cross-origin configuration uses the `script` key. The `transformAssets` script callback context now exposes only `kind: 'script'` and `url`, keeping script format handling internal to manifest rendering.
