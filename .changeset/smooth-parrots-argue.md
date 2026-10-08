---
'@tanstack/router-utils': minor
'@tanstack/router-plugin': minor
'@tanstack/start-plugin-core': minor
'@tanstack/router-generator': minor
'@tanstack/router-cli': minor
'@tanstack/router-vite-plugin': minor
'@tanstack/react-start-rsc': patch
---

Replace Babel-based route and Start compilation with Yuku's parser, semantic analysis, AST utilities, and code generator. Parsing and analysis run on Yuku's native core, or on its WebAssembly core in WebContainers such as StackBlitz and where the native binding cannot load. Share immutable route analysis across chunk planning and generation while preserving independent output trees and bounded cache lifetimes.

Compiler extension hooks and AST helpers now expose Yuku nodes and semantic context. Babel nodes, traversal paths, and helper APIs are removed; extensions must migrate to the native interfaces. Routing and server-function runtime contracts remain unchanged.

A `createServerFn` that is not assigned to a module-level variable now fails the build in every environment: one declared inside a function or block, a default export, an object property, an assignment, or a function that returns one, including such wrappers shipped by libraries, since the compiler also processes dependencies. Previously these server functions were left untransformed, so their handlers and server-only imports shipped to the client.

A route created inside a function or IIFE (a route factory) is neither code-split nor hot-updated. The router plugin now reports a bundler warning for it in development and builds, instead of skipping it silently.
