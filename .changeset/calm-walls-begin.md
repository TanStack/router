---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix `Link` to keep internal routing props like `preloadIntentProximity`, `from`, and `unsafeRelative` from leaking to rendered DOM elements across React, Solid, and Vue.
