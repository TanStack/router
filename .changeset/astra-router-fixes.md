---
'@tanstack/router-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-generator': patch
'@tanstack/start-plugin-core': patch
---

Route splitting, route HMR and route files:

- **Start:** a route with `server` handlers whose page is in its `.lazy` file (or a piece file) stays in the client route tree, on Vite and Rsbuild, so client-side navigation reaches it.
- **Lazy route file HMR** reloads the page, as before route HMR covered lazy files, when the edit removes an option the route had loaded (the route file's value of that option shows again), and when the router the page created last (`window.__TSR_ROUTER__`) has its own route of that id that loads no lazy file (a second router on the page).
- **Route HMR:** a component option set to `null` (`errorComponent: null`) and given a component by an edit, or the other way round, updates in place instead of throwing and reloading.
- **React route HMR** registers an unsplit higher-order component call (`component: withAuth(Page)`) with React Refresh only when everything the route statement evaluates before it is a literal, a function, an identifier or the route's own `createFileRoute('/x')`. Otherwise the call stays where the file runs it, after the options before it, and an edit may remount it.
- **`codeSplitGroupings`** are read only where routes are split: with `autoCodeSplitting: false`, a computed value no longer fails the dev server. A `get codeSplitGroupings()` accessor isn't read, and the next source of groupings applies.
- **A second route constructor call** through the router's namespace (`Router.createFileRoute(…)` twice) fails the build at that call, as a second direct call does.
- **Symlinked route files:** when two route files of the tree link to the same file, or one links to another, the upkeep of the one whose route that file doesn't hold replaces its link with a file of its own, and the router loads both routes. With Start, the document of a symlinked route links the stylesheets of its split chunks.
