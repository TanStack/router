---
'@tanstack/start-plugin-core': patch
---

Stop resolving top-level calls such as `z.object()` whose receiver is not a namespace import. They can never be a `createServerOnlyFn` or `createClientOnlyFn` call, and resolving them made the dev compiler load and parse the receiver's module (all of zod, for example).
