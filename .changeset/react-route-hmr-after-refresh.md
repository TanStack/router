---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

React route HMR always shows an edit: after a route file edit the router takes the new component once React Refresh ran its refresh pass (or after 200 ms when no pass comes), and React Refresh alone decides whether the mounted component keeps its state. A component React Refresh can't patch (a conditional behind a `const`, a factory's result, an unexported class, a layout imported through a barrel that switches module) used to keep showing the old code until a reload. A route update of an unsplit React route lands one refresh pass later than before (about 17 ms on Vite, 31 ms on Rsbuild).
