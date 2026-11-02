---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/router-devtools-core': patch
'@tanstack/router-cli': patch
'@tanstack/router-generator': patch
'@tanstack/start-client-core': patch
'@tanstack/start-plugin-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Correct experimental route-module installation identity, scope ownership, framework navigation parity, and Start context validation. Generate independently tree-shakeable scope APIs and explicit dependency namespaces, and keep module composition helpers internal. Use ordinary TypeScript declaration builds, refresh route topology during development, and include provider routes in Start client pruning and prerender discovery.
