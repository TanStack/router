---
'@tanstack/start-client-core': minor
---

Add a `strict` option to `createServerFn` for type-level server function serialization checks. Use `strict: false` to opt out for input and output values, or `strict: { output: false }` to opt out for return values only.
