---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Allow active and inactive Link props to override base element props in React and Solid while preserving class/style merging. Keep React's `href`, `target`, and `disabled` values controlled by routing options. Preserve Vue object and nested-array class bindings, including reactive updates and server rendering, without mutating cached bindings during VNode normalization.
