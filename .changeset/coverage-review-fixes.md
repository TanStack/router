---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

With RSC, a `<ClientOnly>` written in a server function's handler keeps its children: the environment that renders server components sends them in the Flight payload, and the browser renders them after hydration. A server fn's `.handler(…)` called with more than one argument (with a cast) loses all of them on the client, not only the first. A server fn only another server fn's handler and a split component call moves into the component's chunk, as on main. A split option's lazy import is written in its route option when one option reads it, so a minifier can inline a declaration the route options spread. A `<Hydrate>` capture named `children` keeps its name. Vite dev: renaming or deleting a route file sends no update for the removed file before the reload, so the page no longer logs a failed request and "Failed to reload".
