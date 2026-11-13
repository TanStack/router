---
'@tanstack/start-plugin-core': patch
---

Rsbuild: the Start manifest pass reads a module's resolved imports once per compilation instead of once per chunk that holds it. The manifest is unchanged. On a 333-route app the pass takes about 12 % less time per HMR update (61 → 55 ms). Together with the previous change to this pass, it goes from 432 to 277 ms per HMR update on a 1,485-route app (−35 %).
