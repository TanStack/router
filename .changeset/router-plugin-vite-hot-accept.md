---
'@tanstack/router-plugin': patch
---

Vite route HMR now writes `import.meta.hot.accept(` out instead of calling it through a `hot` alias. Vite only treats a module as a hot boundary when the call is spelled out, so an edit of a route file no framework plugin accepts (a `.ts` route file, or an app without `@vitejs/plugin-react`) reloaded the page instead of updating the route in place. With React HMR, a route file that declares its own top-level `hot` binding no longer fails to compile with `Duplicate declaration "hot"`.
