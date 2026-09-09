---
'@tanstack/history': patch
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
---

Validate navigation and redirect destinations, keep ambiguous relative URLs on the current origin, and constrain prerender requests and output paths. Prevent redirect headers from appearing in serialized server function response bodies.

Preserve native form HTTP redirects, route error handling and masks for document redirects, and per-navigation destinations for shared loader redirects. Avoid redundant origin parsing and reduce link styling and server-rendering work. Configured origins must already be normalized.

Keep blocked-link inactive props consistent during React hydration, honor explicit redirect Location headers before checking route options, and refresh Vue link state when destinations become internal. Reuse the protocol-relative URL check while parsing redirect schemes once.

Reduce React link bundle size by sharing pathname comparisons, state-prop selection, and element creation.

Share normalized pathname comparisons in Solid and Vue links to reduce bundle size.
