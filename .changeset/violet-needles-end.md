---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Reduce the bundle cost of centralized Link state handling by sharing state publication, using compact internal tuples, inlining view construction and commit wrappers, and removing redundant navigation option copies in React and Solid.
