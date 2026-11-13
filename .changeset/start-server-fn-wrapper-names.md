---
'@tanstack/start-plugin-core': patch
---

A server function nested in code an environment erases (an isomorphic function's `.server()` on the client) no longer shifts the generated wrapper names of the file's other server functions in that environment. Before, a top-level server function whose name matched a nested one's numbered key (`fn_1`) could call the nested function from the client on a Vite dev server.
