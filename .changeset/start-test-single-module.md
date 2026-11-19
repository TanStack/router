---
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
---

`mockMiddleware` can now replace a middleware that is created in the file of a server function that uses it. In a Vitest run, a file with server functions is one module on the server. Before, the server loaded the file a second time for the handlers of its functions, as it does in the app, and the mock did not reach the middleware object of that second module.
