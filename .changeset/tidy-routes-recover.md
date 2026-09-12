---
'@tanstack/router-core': patch
'@tanstack/router-plugin': patch
'@tanstack/react-start-rsc': patch
---

Recover missing Webpack and Rspack route chunks through the existing reload-once path. Keep route hot updates scoped to their owning router and avoid patching another router's same-ID route on first import.

Let Vite replace RSC stylesheets during HMR without accumulating persistent React preinit links.
