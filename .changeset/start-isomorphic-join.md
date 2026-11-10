---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

A value chosen between two isomorphic functions (`flag ? a : b`, `a ?? b`) of which only one's call returns a Start builder now fails the client build at the choice, as other uses the compiler cannot follow do; the server function built on its call was compiled as unknown code and its handler shipped to the client.
