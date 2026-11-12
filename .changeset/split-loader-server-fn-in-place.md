---
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

An object-form `loader` whose `handler` is a server function written in place (`loader: { handler: createServerFn().handler(…) }`) now fails the server build with an error at the server function that says what to do (declare it as a module-level `const` and pass it by name), instead of an internal `conflict: two claims on region …` error without a position. A server function used directly as the loader (`loader: createServerFn().handler(…)`, or a `const` holding one) builds; where loader splitting is configured it stays in the route module with a warning, and `loader: () => loaderFn()` splits.
