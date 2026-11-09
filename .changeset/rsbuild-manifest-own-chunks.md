---
'@tanstack/start-plugin-core': patch
---

Rsbuild: a route's client manifest entry lists only its own chunks and CSS. When two routes shared a module in a chunk of its own, each route's entry also listed the other route's chunk as a preload and its stylesheet.
