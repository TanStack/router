---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Vite dev: saving the route on the page with a syntax error (or a split chunk that throws when it runs) no longer reloads the page; Vite's overlay shows the error and the fix shows in place. The route's split chunk was recorded as importing its route module (its `load` told the dev server's watcher about the route file), so Vite saw an import cycle and reloaded the page when the update failed, landing on the server's error page, which never heard of the fix. A watch build still watches the file.
