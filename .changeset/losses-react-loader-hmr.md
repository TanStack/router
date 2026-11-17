---
'@tanstack/router-plugin': patch
'@tanstack/router-core': patch
---

React route HMR: an edit of a route module that holds none of the route's components (each one split, as `autoCodeSplitting` does by default, or absent) applies as soon as the module evaluates, instead of after React Refresh's next pass (which `@vitejs/plugin-react` runs 16 ms after an update and Rspack's refresh plugin 30 ms after). A loader edit of a split route shows its data that much sooner. A route module that still holds a component (an unsplit route, a component kept by `codeSplitGroupings`) waits as before, so the component keeps its state.
