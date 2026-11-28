---
'@tanstack/start-plugin-core': patch
---

Rsbuild dev, `rsbuild build --watch` and `vite build --watch`: a server-only route that gains a component (or a loader, `head` or another client option) reaches the client. The client route tree leaves server-only routes out, so only the server compiled again and the page showed Not Found until another client edit or a restart. The client route tree module now depends on the route files it left out.
