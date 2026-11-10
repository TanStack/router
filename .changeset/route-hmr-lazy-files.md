---
'@tanstack/router-plugin': patch
'@tanstack/router-core': patch
---

Dev: an edit of a lazy route file (`createLazyFileRoute`, `*.lazy.tsx`) updates the route in place instead of reloading the page, on Vite and Rsbuild, for React, Solid and Vue; a React component keeps its state when React Refresh can patch it, as in a route file.
