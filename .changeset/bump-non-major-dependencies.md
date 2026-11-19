---
'@tanstack/eslint-plugin-router': patch
'@tanstack/eslint-plugin-start': patch
'@tanstack/react-router': patch
'@tanstack/router-core': patch
'@tanstack/router-devtools-core': patch
'@tanstack/router-generator': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
'@tanstack/solid-router': patch
'@tanstack/start-client-core': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
'@tanstack/start-static-server-functions': patch
'@tanstack/vue-router': patch
---

Raise the minimum versions of runtime dependencies to their latest non-major releases, including the security fixes in `seroval` and `@babel/core`. The Start config types no longer mark `pages`, `srcDirectory`, `router`, `serverFns` and the other defaulted options as possibly `undefined` under zod 4.6.2 and later.

`no-client-code-in-server-component` keeps reporting `localStorage`, `sessionStorage` and `Storage` in server components. `globals` 16.5 lists Web Storage as a Node.js global (Node.js only provides it behind `--localstorage-file`).
