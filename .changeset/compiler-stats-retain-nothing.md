---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

With `TSR_COMPILER_STATS=1`, the stats registry no longer keeps every session it reads alive: a finished build's or closed dev server's compiler state is released as without the knob.
