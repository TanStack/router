---
'@tanstack/router-utils': patch
---

Vite dev: a route edit's hot update no longer compiles the route module first in an environment where that cannot change the update (the server environment of a Start app, whose split chunks accept no updates and are imported only by the route file's own modules), so Vite sends the update sooner. The compile happens when the server next loads the module, as for any other edited file.
