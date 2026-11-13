---
'@tanstack/start-plugin-core': patch
---

Rsbuild: a Start compile error or warning names its position as the compilation's own location, so Rsbuild's terminal output and error overlay point at it (`File: ./src/fns.ts:3:28`) instead of `:1:1`.
