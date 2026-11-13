---
'@tanstack/router-plugin': patch
---

`vite build --watch` follows route files created while it watches: the route generator watches the route directories itself, as it does under `rspack`/`webpack` watch, and the route tree it writes makes the build compile again with the new route. Before, Vite's watcher reported only files of the bundle, so a new route file never joined the route tree or the output, not even at a later rebuild. This applies whether `build.watch` is set at the top level or per environment, and the generator stops watching when the build's watchers close.
