---
'@tanstack/start-plugin-core': patch
---

Vite dev: a server function request whose id names a file the dev server may not serve (outside `server.fs.allow`, or matching `server.fs.deny`) is refused. Before, the dev server compiled that file and called the function it named.
