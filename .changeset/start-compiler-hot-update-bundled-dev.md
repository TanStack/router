---
'@tanstack/start-plugin-core': patch
---

Guard the start compiler plugin's `hotUpdate` hook against a missing `this.environment`, which crashed every hot update (and left the dev server serving stale output) when Vite's `experimental.bundledDev` passes the hook to Rolldown's dev engine.
