---
'@tanstack/start-plugin-core': patch
---

Rsbuild: the Start manifest pass reads a module's resolved imports once per compilation instead of once per chunk that holds it. The manifest is unchanged; on a 338-route app the pass takes about 8 % less time (about 5 ms less per HMR update).
