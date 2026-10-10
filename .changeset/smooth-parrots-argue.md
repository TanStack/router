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

A route created inside a function or IIFE (a route factory) is not code-split, and edits to its components may need a full page reload. The router plugin now reports a bundler warning for it in development and builds, instead of skipping it silently.

`@tanstack/router-utils`, `@tanstack/router-generator`, `@tanstack/router-plugin`, `@tanstack/router-cli` and `@tanstack/router-vite-plugin` now require Node.js `^20.19.0 || >=22.12.0`: their CommonJS builds load Yuku's ES modules with `require()`, which Node.js 22.0 to 22.11 does not support without a flag.

Other behaviour changes:

- A class, enum, namespace or reassigned `let` that only a split route option uses now moves into that option's chunk, like other declarations already did, so its top-level side effects run when the chunk loads instead of when the route module loads.
- A split route option that refers to an exported binding through a TypeScript cast (`errorComponent: ErrorComponent as any`) is no longer split, like the same option without the cast, and reports the existing "will not be code-split" warning. Previously the component was duplicated into the route module and the chunk.
- A `<Hydrate>` whose content is passed as a `children` prop is now split like JSX children, so hooks or functions there require `split={false}`, as they do for JSX children.
- `.js` and `.jsx` files are parsed as JavaScript with JSX, so TypeScript syntax in them is a syntax error.
- Exporting a type and a value of the same name from two separate `export` statements (`export type { Post } from './types'` and `export { Post } from './post'`) is now a syntax error, as it is in TypeScript.
