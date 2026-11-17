---
'@tanstack/start-plugin-core': patch
---

Vite dev: a `/_serverFn/<id>` request for a function the dev server has not compiled yet compiles the file the id names only when that file, with symlinks resolved, is inside the app's `srcDirectory`, outside `node_modules` and allowed by `server.fs`. Any other id the session has not registered is refused with `Invalid server function ID`. Before this, a forged id could run the server functions and top-level code of any file `server.fs` allows, such as a script outside `src` or a package in `node_modules`, from any client that could reach the dev server. A page left open across a restart still works for the app's own server functions, and a package's server functions answer once the client has loaded their module.
