---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Router plugin on webpack and Rspack, and Start on Rsbuild, in dev and watch builds: a failure inside one of the plugins' own hooks (for example an app plugin that fails a module's build while the router builds an out-of-date route again, or an `importProtection.onViolation` callback that throws) now fails that one compilation with an error that names it, and watching goes on: the next change is built and served. It used to end the bundler's watcher, so the dev server stopped answering (and Rspack 2.3.1 could abort the process at the next compilation). A one-shot build still fails on it.
