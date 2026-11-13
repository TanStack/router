---
'@tanstack/router-generator': patch
'@tanstack/router-plugin': patch
---

Route files the generator lists are reported when the code splitter can't read their `Route`, in two more shapes: a route made with `createRoute` (the constructor of code-based routes), and a `Route` declared by a destructuring pattern (`export const { Route } = …`, `export const [Route] = …`). Like the other unrecognised shapes, they build and warn that the route is not code-split and, under TanStack Start, that its `server`, `headers` and `ssr` options ship to the client; the message offers the `createFileRoute('/x')({ … })` call to write. A route id in parentheses or a TypeScript assertion (`createFileRoute(('/x'))`, `'/x' as const`) is a string literal the generator keeps in sync, instead of being reported as "not a string literal". A Vite build given the router plugins inline (the same objects for every config resolution) prints each generator warning once instead of once per resolution; the `Generator` takes an optional `logger`.
