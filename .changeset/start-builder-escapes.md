---
'@tanstack/start-plugin-core': minor
'@tanstack/router-utils': patch
---

Start never ships server code to the client through a builder it cannot follow: each use of a Start builder or factory (`createServerFn`, `createMiddleware`, `createIsomorphicFn`, `createServerOnlyFn`, `createStart` and what they return) is either compiled or fails the client build with an error at that use.

- **Newly compiled:** a Start namespace or start instance destructured (`const { createServerFn } = Start`, `const { createMiddleware } = createStart(…)`), `(0, createServerFn)()`, a builder chosen by `?:`, `??`, `||` or `&&` between two builders of the same kind, a factory with statements before its single `return`, and the JavaScript of `.mdx`, `.vue`, `.svelte`, `.astro` and `.marko` modules that name a Start package (their server functions are compiled in place).
- **Now a client build error, at the use:** a builder or factory passed to a function, stored in an object, an array, a class field or another variable, awaited or rendered as a JSX prop; a method read off a builder (`const h = createServerFn().handler`, `.call`, `.bind`); a builder returned from a function with control flow, from an async function, a method or a getter; a reassigned `let` holding a builder; a builder destructured; a Start package imported with `import()` or `require()`; a client-only `createIsomorphicFn().client(fn)` or `createMiddleware().client(fn)` passed to other code (use `createClientOnlyFn(fn)`).
- **A function parameter that reaches server code:** passed directly as the server code (`(fn) => createServerOnlyFn(fn)`, `({ handler }) => createMiddleware().server(handler)`, an isomorphic `.server(fn)`), it is a client build error at that use, since its argument is server code and every call keeps it on the client. Only read inside the server code (`(role) => createMiddleware().server(() => check(role))`), it gets one warning at its definition: the arguments of its calls still ship to the client, so do not pass secrets or server code through it.
- **At the end of a client build:** a module exporting a builder, a factory or the start instance that is imported with `import()`, `require()` or `import.meta.glob`, by a virtual or other module the Start compiler does not compile, or whose namespace object is passed around, fails the build naming both modules.

In development the same errors fail the module (the overlay shows them); a module importing another can be served before that one fails, and the build always fails.
