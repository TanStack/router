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

A `createServerFn` must be assigned to a module-level variable. One declared inside a function, block or switch case is now a compile error in every environment, instead of shipping its handler to the client or producing an invalid server function module.
