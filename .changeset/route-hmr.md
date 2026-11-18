---
'@tanstack/router-core': minor
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/router-plugin': patch
---

Route HMR (development only) runs on a new runtime that the router plugin's dev output imports from new `/hmr` subpaths (`@tanstack/router-core/hmr`, `@tanstack/{react,solid,vue}-router/hmr`). It updates the live route in place and keeps each split component's lazy wrapper across updates. Nothing of it reaches production bundles, and production and server code never load it.

- **React: an edit always shows.** The router takes the new component once React Refresh ran its refresh pass (or after 200 ms when no pass comes), and React Refresh alone decides whether the component keeps its state. A route module that holds none of the route's components (each one split, as `autoCodeSplitting` does by default, or absent) applies an edit as soon as it evaluates. A component React Refresh can't patch (`const Page = flag ? Wide : Narrow`, a factory's result, an unexported class, a layout import switched to another module) kept showing the old code until a reload.
- **Solid: an edit always shows.** The router keeps the component it holds only when solid-refresh patched it in place (both are solid-refresh proxies of the same component name and file). Before, a component chosen by a condition (`flag ? Wide : Narrow`), a swap through a barrel or a rename in an unsplit route could stay stale. Split chunks carry the route file's leading `@refresh` pragmas (`// @refresh granular`), so a split component keeps its state where an unsplit one does. After a rename or a removed component in a split route, later edits show only after a reload (solidjs/solid-refresh#88). A `codeSplitGroupings` edit that moves a component to another chunk (or in or out of the split) reloads the page; before, the edits after it stayed stale until a reload.
- Lazy route files (`createLazyFileRoute`, `*.lazy.tsx`) update in place instead of reloading the page, on Vite and Rsbuild, for React, Solid and Vue; a React component keeps its state when React Refresh can patch it. The page still reloads when the edit removes an option the route had loaded from the lazy file (the route file's value shows again), and when the router the page created last (`window.__TSR_ROUTER__`) has its own route of that id that loads no lazy file.
- On Rspack, an edit of a split loader refreshes the route; the page kept the old loader's data.
- An edit of a Vue route file keeps the component of its `*.component.vue` file; the page went blank until a reload.
- An update patches only the route its module exported, so another router in the same window (module federation) is left alone (#7921).
