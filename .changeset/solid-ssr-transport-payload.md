---
'@tanstack/solid-router': patch
'@tanstack/solid-start-client': patch
---

Solid owns its SSR transport and payload channel — with zero diff outside the Solid packages. The DehydratedRouter rides Solid's eval-free JSON record codec (`__TSR_P`) instead of the `$_TSR` script channel: a Solid-side override of the framework-only `serverSsr.dehydrate` (installed via the `onServerSsrAttach` lifecycle) builds the payload the way core does and serializes it through `createJSONSerializer` into a Solid-owned script buffer served by overridden `takeBufferedScripts`/`liftScriptBarrier`; the HTML stream transform is replaced with a Solid-native script sink in `renderRouterToStream`; and the client installs a synthetic `window.$_TSR` whose lazy `router` getter decodes the record queue, so core `hydrate` is unchanged. The SSR HTML carries no `$_TSR` bootstrap, no `$R` cross-reference header, and no parse-time eval. Falls back to the script channel wherever the Solid transfer isn't armed (and the client shim defers to a real `$_TSR` bootstrap), so React/Vue and older-server documents are untouched. A follow-up core-hooks PR against `main` will collapse the overrides into supported seams.
