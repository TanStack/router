---
'@tanstack/router-utils': minor
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
---

Dead-code removal is one rule at every level of a module: what only removed code used (a server fn handler on the client, a `createServerOnlyFn` body, a split route option, a type the client erases) leaves with it, from a function's locals, a destructuring pattern, a namespace's members and the top level alike. Code that stays keeps its behaviour, but for the changes listed last.

- **Server code no longer reaches the client through:** a parameter default only server code reads (`make(db = getServerDb())` becomes `make(db = void 0)` on the client; literal defaults stay, `length` doesn't change); a sibling of a destructuring pattern nobody reads (`const { unused, secret } = getServerObj()`); a pattern default beside a rest element; a type alias, interface, namespace of types or `declare` that only removed code names, also through `import A = N.M` (a chain of aliases of any length), `export type { X }` and a reopened namespace's other block.
- **Registrations no longer disappear:** a value and a type of one name are two uses (`const Shape = register(); type Shape = …`), so a type only removed code names doesn't take a value of its name with it; a namespace of types beside a class, `enum` or `const` doesn't take the value either.
- **Code that throws keeps throwing:** a declaration that reads itself while it is initialised (`const { a = a } = o`, `const x = (() => x)()`) stays.
- **What changes on the client, by design:** a removed definition takes its own evaluation with it (a getter of a removed name isn't read, a removed default's call doesn't run); a pattern that stays drops its dead positions, so a `null` there no longer throws on the client; a name read only through a direct `eval` can be removed. The limits and their workarounds are listed in the compiler's known bugs.
