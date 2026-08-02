---
'@tanstack/react-start-rsc': patch
---

Import `getRequest` from the `@tanstack/start-server-core/request-response` subpath instead of the root barrel. The barrel re-exports `createStartHandler`, whose dynamic `#tanstack-router-entry` import survived into the RSC build whenever `renderServerComponent` or `createCompositeComponent` entered the `rsc` environment graph, emitting a chunk that duplicated every server-route dependency into the RSC bundle.
