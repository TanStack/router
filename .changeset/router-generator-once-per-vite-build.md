---
'@tanstack/router-plugin': patch
---

A Vite build whose environments share the app's plugins (`builder.sharedPlugins`, as TanStack Start sets it) generates the route tree once instead of once per config resolution (the top level's and each environment's): two of three generator runs less in a Start build, and a generator plugin's `onRouteTreeChanged` runs once. Plugins passed inline to `createBuilder` are given to every resolution and generate in each, as before.
