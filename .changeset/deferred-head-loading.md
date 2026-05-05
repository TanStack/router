---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
'@tanstack/start-server-core': minor
---

Add support for deferred head loading. Returning a `Promise` in any of `meta`, `links`, or `styles` from `head()` lets the page render immediately and awaits the promise for crawlers so resolved tags appear in the initial response for SEO and social previews. On the client, `head()` is re-evaluated once the promises settle and `<HeadContent />` updates with the resolved values.

The same deferred behavior is also supported for `scripts` returned from `head()` and for the body scripts array returned from `routeOptions.scripts`, with `<Scripts />` updating once the promises settle.
