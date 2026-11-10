---
'@tanstack/router-plugin': patch
---

A split route option whose value sits in a cast (`as`, `satisfies`, `!`) now carries the value into its chunk as each build compiled it. Before, a value Start compiles per environment (`loader: createIsomorphicFn().server(…).client(…) as any`, `createServerOnlyFn(…) as any`, `createServerFn().handler(…) as any`) reached the client chunk as written: the client build succeeded, shipped the server implementation and read an undeclared name. A server function written in place in a cast now fails the build at the server function, as it does without the cast. The same holds in development for a component route HMR keeps in the route module.
