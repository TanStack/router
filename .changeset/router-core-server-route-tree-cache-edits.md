---
'@tanstack/router-core': patch
---

A dev server whose `NODE_ENV` is not `development` (for example `NODE_ENV=production vite dev`, or a dev server under test) renders a route's edit on the server: the server's shared route tree cache no longer serves the routes the route tree held before the edit.
