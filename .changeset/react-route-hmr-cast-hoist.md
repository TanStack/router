---
'@tanstack/router-plugin': patch
---

React development: an inline higher-order component whose argument is a cast (`component: memo(Page as any)`) in a route module is hoisted like `memo(Page)`, so it keeps its state on Rsbuild. Vite's React Refresh transform registers no component for that spelling yet; it still remounts there.
