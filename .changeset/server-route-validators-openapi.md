---
'@tanstack/start-client-core': minor
'@tanstack/start-server-core': minor
'@tanstack/start-openapi': minor
---

Add slot-shaped `validator` (`body`, `query`, `path`, `headers`) to request middleware and server route method builders, validated before the handler and passed as `ctx.data`. Method builders also accept `response`, `operationId`, `summary`, `description`, `tags` and `deprecated`. New `@tanstack/start-openapi` package generates OpenAPI 3.1 documents from server routes.

Request middleware validators are enforced wherever the middleware runs: global request middleware, route middleware on page renders and method handlers. Validators of the same slot must agree on shared output keys; a disagreement throws. A request middleware with a validator in a server function's middleware chain throws, since its slots cannot be enforced there.
