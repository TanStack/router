---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Return `AsyncRouteComponent` from `lazyRouteComponent` instead of a `never` conditional

The previous `T[K] extends (props: infer P) => any ? AsyncRouteComponent<P> : never` return type is resolved as `error` by tsgolint (and similar checkers that cannot instantiate that conditional). Named-export inference is unchanged via a default `TProps` type parameter.
