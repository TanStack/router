---
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
---

In a Vitest run, a file with server functions is now one module on the server. Before, the server loaded the file a second time for the handlers of its functions, as it does in the app, so a handler and the other code of the file each had their own copy of the file's module state. A test can now read and reset state that a handler of the file uses, and `mockMiddleware` can replace a middleware that is created in the file of a server function that uses it.
