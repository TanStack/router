---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

The compiler renders every output, and works out what each part of a module reads there, through one walk of its rewrite tree. A module of many server functions written in place compiles in time that grows with their number (a module of 1,600 took about 10 times as long as one of 400, and now takes about 4 times as long). Outputs are unchanged.
