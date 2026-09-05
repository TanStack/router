---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix active and inactive Link props overriding base props in React and Solid while preserving class/style merging. Preserve Vue object and nested-array class bindings, including reactive updates and server rendering, without mutating cached bindings during VNode normalization.
