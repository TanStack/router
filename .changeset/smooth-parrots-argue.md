---
'@tanstack/router-utils': major
'@tanstack/router-plugin': major
'@tanstack/start-plugin-core': major
'@tanstack/router-generator': patch
'@tanstack/react-start-rsc': patch
---

Replace Babel-based route and Start compilation with Yuku's native parser, semantic analysis, AST utilities, and code generator. Share immutable route analysis across chunk planning and generation while preserving independent output trees and bounded cache lifetimes.

Compiler extension hooks and AST helpers now expose Yuku nodes and semantic context. Babel nodes, traversal paths, and helper APIs are removed; extensions must migrate to the native interfaces. Routing and server-function runtime contracts remain unchanged.
