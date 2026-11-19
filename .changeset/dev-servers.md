---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Dev servers:

- Vite: a module that imports a file that doesn't exist yet loads it once the file is created; it kept failing until a restart.
- A Vite dev server without HMR (`server.hmr: false`, as Vitest runs one) tells Start's compiler about file changes: a module whose import became (or stopped being) a server function builder kept its old compile, with the handler's code in the client module, until a restart.
- Vite: deleting a nested `package.json` whose `imports` or `exports` a module resolved through rebuilds that module in the client and in SSR. When the parent package's mapping pointed the import at a server function builder (or away from one), the old compile stayed until a restart.
