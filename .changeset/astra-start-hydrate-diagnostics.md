---
'@tanstack/start-plugin-core': patch
---

Server functions, `<Hydrate>` and import-protection reports:

- In a production build, a server function answers an HTTP call by its id only when the client bundle still calls it. A server function private to a module the client imports, such as a helper that only another server function's handler calls, used to answer too, because the client's compile registered it before tree-shaking dropped it. Server code still calls it as before. A server function that reaches the browser only by serialization (a loader returning it) is no longer callable over HTTP: reference it from client code too. This applies on Vite and Rsbuild, with and without RSC.
- The build warns when `.handler()` is given a binding the module assigns elsewhere (`let selected = a; createServerFn().handler(selected); selected = b`). The handler module reads the binding at the first call, so a later assignment changes the handler. Pass a function written in place or a `const` instead.
- `<Hydrate>` refuses split children that call a hook inside an immediately invoked function (`(() => useId())()`), as it refuses a direct hook call. Before, they built and broke hydration.
- `<Hydrate>` refuses split children that read a private name of the class around the boundary (`this.#label`). Before, React on Rsbuild built a chunk the browser could not parse.
- The import-protection fix suggested for a browser-only component that a route option renders now passes the router's props on: `errorComponent: (props) => <ClientOnly fallback={...}><Oops {...props} /></ClientOnly>`.
- A marker violation's report gives the position of the marked module's marker import (`file:line:column`). A comment mentioning the marker used to take its line.
