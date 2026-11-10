---
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

`vite build --watch`: the router and Start plugins tell the watcher about every file a module's compile read, also one outside the module graph. A client module whose denied import was replaced by its mock is rebuilt when that file stops being denied, instead of keeping the mock until the module itself changes.
