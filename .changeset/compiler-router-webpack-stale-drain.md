---
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

Router plugin on webpack and Rspack, in dev: a route whose registry entry changed without its file changing (a virtual route config that mounts the file elsewhere, or makes it a route) is built again in the compilation that follows, also on webpack, where it used to keep the code split decided for its old route id until the file was saved. The plugin's loader rule now matches every JavaScript module outside `node_modules` (the loader leaves modules that are no routes as they are), so a file stays one module when it becomes a route or stops being one.
