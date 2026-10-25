---
'@tanstack/router-generator': patch
'@tanstack/start-plugin-core': patch
---

Route generator: a route file whose route the virtual route config moves (a `route()` path, a `physical()` prefix, a `__virtual.ts` entry) gets its new id without a content change; a route file used for two routes and two routes with one id are errors naming the files; concurrent writes no longer share a temporary file; the generator's own route tree write no longer regenerates; clearer warnings for a Route without its options call or with a type-only constructor import. Start: generator plugins given as `router.plugins` run next to Start's (#7768); Start's route tree footer follows `quoteStyle` and `semicolons`; Rsbuild dev answers the SPA shell with `spa.enabled` (#8543) and no longer forces `server.compress: false` over the app's config (#8544).
