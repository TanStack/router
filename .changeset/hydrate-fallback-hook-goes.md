---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

On the server, a hook call whose value only a `<Hydrate>` `fallback` reads now goes with its declaration and the imports only it used, in every file, as it already did in a route's split component. A hook that needs the browser (`useState(() => window.innerWidth)`) in a component file outside the route no longer makes the server render fail. A hook that takes an id (`useId`, or a custom hook that calls it) changes the ids after it on the server, as with `<ClientOnly>` children: call such a hook in a component inside the boundary.
