---
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

A split `loader` whose value is a server function written in place (`loader: createServerFn().handler(…)`, or the `handler` of an object-form loader) now fails the server build with an error at the server function that says what to do (declare it as a module-level `const` and pass it by name), instead of an internal `conflict: two claims on region …` error without a position.
