---
'@tanstack/history': patch
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Notify React, Solid, and Vue Links only when navigation can affect their destination or active state. Fixed Links use indexed pathname interests, while function-based destinations keep direct location updates. Preserve Link APIs and history href formatting behavior.

React Links owned by a departing route defer their active-state update until navigation settles. If navigation is superseded and the Link remains mounted, it catches up to the current location.
