---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Rsbuild dev: an edit rebuilds the edited module and only the modules compiled against facts the edit changed (a comment in a module hundreds of modules import rebuilds that module alone), and a file that appears and takes a resolution (`./lib` finding a new `lib.ts` before `lib/index.ts`) has its importers compiled again. A dev server or build restarted on Rspack's persistent cache compiles again a restored module whose imports changed while it was down, and keeps tracking the restored modules afterwards.
