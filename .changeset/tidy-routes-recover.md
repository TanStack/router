---
'@tanstack/router-core': patch
'@tanstack/router-plugin': patch
'@tanstack/react-start-rsc': patch
---

Recover missing Webpack and Rspack route chunks through the existing reload-once path. Avoid patching another router's same-ID route on a module's first import during development.

Let Vite replace RSC stylesheets during HMR without accumulating persistent React preinit links.
