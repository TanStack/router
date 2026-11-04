---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Route HMR on Rsbuild and webpack: an edit of a route file reaches the split chunks (and `<Hydrate>` chunks) that read a binding the route module keeps; they used to go on showing the binding's first value until a reload. The route module's evaluation invalidates them and refreshes the route once the update is applied.
