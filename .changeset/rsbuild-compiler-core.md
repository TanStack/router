---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Start on Rsbuild runs on the new compiler core: one compile per environment, layer and module through Start's own Rspack loaders (server functions, environment separation, `<Hydrate>`, RSC CSS, route splitting and HMR, import protection in one plan), server-function and import-protection facts persisted in `buildInfo` and replayed for the persistent cache, import-protection build verdicts after tree-shaking with an additional pass on `onViolation` vetoes, the route generator as a precondition of every environment compiler, the client route tree without server-only routes, and virtual modules under the resolved root. The Babel Start compiler and the previous Rsbuild import protection are removed.
