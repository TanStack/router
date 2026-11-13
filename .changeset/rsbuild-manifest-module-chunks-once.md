---
'@tanstack/start-plugin-core': patch
---

Rsbuild: the Start manifest pass that runs after every client compilation (builds and each dev update) reads an imported module's chunks once per compilation and counts the module once per importing chunk, instead of once per import connection. The manifest is unchanged; the pass takes 30–45 % less time (on a 333-route app, about 26 ms less per HMR update).
