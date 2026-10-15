---
'@tanstack/router-utils': minor
'@tanstack/router-plugin': minor
'@tanstack/start-plugin-core': minor
'@tanstack/router-generator': minor
'@tanstack/router-cli': minor
'@tanstack/router-vite-plugin': minor
'@tanstack/react-start-rsc': patch
---

Replace Babel-based route and Start compilation with Yuku's parser, semantic analysis, AST utilities, and code generator. Parsing and analysis run on Yuku's native core, or on its WebAssembly core in WebContainers such as StackBlitz and where the native binding cannot load. The WebAssembly core does not run on big-endian hosts (such as s390x) or under `node --jitless`.

Compiler extension hooks and AST helpers now expose Yuku nodes and semantic context. Babel nodes, traversal paths, and helper APIs are removed; extensions must migrate to the native interfaces. Routing and server-function runtime contracts remain unchanged.

A `createServerFn` that is not assigned to a module-level variable now fails the build in every environment: one declared inside a function or block, a default export, an object property, an assignment, or a function that returns one, including such wrappers shipped by libraries, since the compiler also processes dependencies. None of these placements worked before: depending on the other Start APIs in the file, the build already failed with "must be assigned to a variable", or the server function was left untransformed, so its handler and server-only imports shipped to the client and its calls returned `undefined`, or the output failed later in the bundler or at runtime. A function that returns an unfinished builder (`defineAction(schema).handler(fn)`) is still not detected.

A route created inside a function or IIFE (a route factory) is no longer code-split, and the router plugin reports a bundler warning for it in development and builds. Edits to it may need a full page reload. Previously such routes were split, which broke when a split option used the function's locals: a `ReferenceError` at render, a build error, or the wrong component.

`@tanstack/router-utils`, `@tanstack/router-generator`, `@tanstack/router-plugin`, `@tanstack/router-cli` and `@tanstack/router-vite-plugin` now require Node.js `^20.19.0 || >=22.12.0`: their CommonJS builds load Yuku's ES modules with `require()`, which Node.js 22.0 to 22.11 does not support without a flag.

Other behaviour changes:

- An exported function or class that a split route option uses (an exported page component the split component renders, an exported store class or helper) now moves into the route's shared module, which the route module re-exports it from, so the split chunk and every other importer use one instance: `instanceof` checks and module state agree across modules. When nothing else imports it, the bundler can leave it, and the imports only it uses, out of the route module's chunk, so the top-level side effects of those imports run when the split chunk loads. Previously the split chunk declared its own copy. An exported function that reads `Route` is still copied into the chunk when it holds no module state.
- A class, enum, namespace or reassigned `let` that only a split route option uses now moves into that option's chunk, like other declarations already did, so its top-level side effects run when the chunk loads instead of when the route module loads.
- A split route option that refers to an exported binding through a TypeScript cast (`errorComponent: ErrorComponent as any`) is no longer split, like the same option without the cast, and reports the existing "will not be code-split" warning. Previously the component was duplicated into the route module and the chunk.
- A `<Hydrate>` whose content is passed as a `children` prop is now split like JSX children, so hooks or functions there require `split={false}`, as they do for JSX children.
- `.js` and `.jsx` files are parsed as JavaScript with JSX, so TypeScript syntax in them is a syntax error.
- Exporting a type and a value of the same name from two separate `export` statements (`export type { Post } from './types'` and `export { Post } from './post'`) is now a syntax error, as it is in TypeScript.
- The route generator no longer treats a type-only `Route` export (`export type { X as Route }`, `export { type X as Route }`, `export declare const Route`) as the route export: it exports nothing at runtime, so the file is reported as having no `Route` export.
- Import protection mocks now include the names that `export * as ns`, `export enum` and `export namespace` export, no longer expose names exported inside a namespace, and cover `ns.x` reads that come before `import * as ns`.

Fixes:

- Route options wrapped in `as any`, `satisfies` or `!`, and a route factory call wrapped in a cast, are now code-split. Previously the file was left untransformed, so a server route written this way also kept its `server` handlers in the client.
- Split route components written as a call containing JSX (`React.memo(() => <p />)`, a Vue `defineComponent` whose `setup` returns JSX) now compile.
- A component used by both a split and an unsplit route option no longer throws "is not defined", and a component declared with `function Page` and exported with `export { Page }` no longer breaks the build.
- Split chunks now import the classic JSX factory (`/** @jsx h */`) the route module exports, declare an enum or namespace that the loader and the component read once, keep the body of a dotted namespace (`namespace A.B {}`), and no longer import values that only types read. A split-only component named like a type no longer also stays in the route module.
- The route generator records route options written as methods or accessors.
- `createServerOnlyFn` and `createIsomorphicFn` passed to `.handler()`, and `.server()` or `.validator()` chain links wrapped in a cast, now compile correctly.
- `<Hydrate>` children that read `Route` import it, also when it is exported under a string name; children passed through a `children` prop or a spread render; and `split={false}` works inside a cast.
- Import protection reports usages inside JSX and skips type positions and member properties, and its mocks no longer reuse a name the module declares.
