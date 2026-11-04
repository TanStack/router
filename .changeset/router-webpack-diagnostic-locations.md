---
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

Rspack, webpack and Rsbuild: a router compile error or warning names its position as the compilation's own location, so the bundler's output points at it (`File: ./src/routes/index.tsx:2:22`, `WARNING in ./src/routes/index.tsx 2:22`) instead of `:1:1` or no position.
