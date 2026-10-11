---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start-rsc': patch
---

Build the code the Start compiler inserts (server function RPC calls and handlers, env-only and isomorphic stubs, Hydrate imports and boundaries, RSC CSS options, import protection mocks) directly instead of parsing it, for faster server function compilation.
