---
'@tanstack/router-utils': patch
---

Compiling a module with many server functions, or many other changes the compiler makes, no longer takes time that grows with the square of their number: a module of 1,600 server functions took about 10 times as long as one of 400, and now takes about 4 times as long. Outputs are unchanged.
