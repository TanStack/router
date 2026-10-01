---
'@tanstack/history': patch
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Coordinate Link destination and active-state updates in the router, selecting affected links by their location dependencies and destination paths. Defer work for links in departing matches until navigation settles, while preserving immediate updates for persistent links and the existing Link API. Share derivation across React, Solid, and Vue, keep server rendering non-reactive, and release replaced callback captures and subscriptions.

Fix React Links retaining an old target or click behavior when only `href` or `reloadDocument` changes.
