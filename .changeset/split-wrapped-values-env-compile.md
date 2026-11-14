---
'@tanstack/router-plugin': patch
---

A split route option whose value sits in an `as` cast now carries the value into its chunk as each build compiled it. Before, a value Start compiles per environment (`loader: createIsomorphicFn().server(…).client(…) as any`, `createServerOnlyFn(…) as any`) reached the client chunk as written: the client build succeeded, shipped the server implementation and read an undeclared name. The same holds in development for a component route HMR keeps in the route module.
