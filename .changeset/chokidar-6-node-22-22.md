---
'@tanstack/router-cli': minor
'@tanstack/router-generator': minor
'@tanstack/router-plugin': minor
'@tanstack/router-vite-plugin': minor
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': minor
'@tanstack/react-start-rsc': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
---

Require Node `>=22.22.0`. Before this, `@tanstack/router-cli`, `@tanstack/router-generator` and `@tanstack/router-plugin` required `^20.19.0 || >=22.12.0`, `@tanstack/router-vite-plugin` `>=20.19`, and the Start packages `>=22.12.0`. The route generator and the CLI now depend on chokidar 6, which requires Node 22.22. Node versions below 22.22.0 are no longer supported, and Yarn 1 refuses to install these packages on them.

chokidar 6 fixes two cases where the route generator's file watcher could miss changes. That watcher runs under `tsr watch`, Rspack and webpack watch mode, Rsbuild dev and `vite build --watch`, but not Vite dev. Both were tested on Linux:

- A route file saved again within 50 ms of the previous save, for example by a format-on-save or a script, now reaches the route tree. Before, the route could keep the first save's content. A route file that is a symlink can still miss the second save.
- A routes directory that is deleted and created again, for example by a branch switch, is watched again. Before, route changes could stop reaching the route tree until the watcher was restarted.
