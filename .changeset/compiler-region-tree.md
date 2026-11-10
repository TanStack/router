---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Compiling a module with many server functions, or many other changes the compiler makes, no longer takes time that grows with the square of their number, whether their handlers stay in place or are hoisted: a module of 1,600 server functions took about 10 times as long as one of 400, and now takes about 4 times as long. Outputs are unchanged.
