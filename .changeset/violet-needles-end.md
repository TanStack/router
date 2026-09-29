---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Reduce the bundle cost of centralized Link state handling by separating shared operations from per-link state, simplifying result storage, and reusing core link classification in the Solid binding.
