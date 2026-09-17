---
'@tanstack/solid-start': patch
---

Patch @rsbuild/plugin-solid's native `solid` loader options for SSR builds. Since 2.0.0-beta.1 the plugin compiles through its own loader (native compiler by default) instead of registering babel-preset-solid, so the babel preset patch never fired and node-target bundles were compiled in dom mode, crashing at import with "Client-only API called on the server side". The rsbuild start plugin now patches the loader's `solid` options (`generate: 'ssr'` on node targets, `hydratable: true`) alongside the legacy babel preset patch.
