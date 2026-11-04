---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Import protection: a dead re-export of a denied module whose top level holds Start builder chains (`createServerFn().handler(…)`, middleware, isomorphic and env-only fns) with pure arguments is no longer reported. An argument the environment's compile erases (a validator such as `.validator(z.object({ … }))`, a handler or a server implementation on the client; a client implementation on the server) does not count there, and neither does what only such an argument reads (a module only a handler imports, a schema const only a validator reads). A real effect, an unknown method, top-level `await` and live imports are still reported. The compiler no longer recognises the removed `.inputValidator()`: a call of it fails the client compile at the call.
