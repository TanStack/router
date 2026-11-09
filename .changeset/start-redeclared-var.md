---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

A server function built on a `var` that redeclares a function or a parameter of the same name (JavaScript allows it, TypeScript does not) now fails the client build instead of shipping its handler: after a function declaration the `var` is reported as a reassignment, and a parameter's `var` as a local of the enclosing function, as `const` locals are.
