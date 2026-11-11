---
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

Router plugin on webpack and Rspack, in dev: a route whose registry entry changed without its file changing (a virtual route config that mounts the file elsewhere, or makes it a route) is built again in the compilation that follows, also on webpack, where it used to keep the code split decided for its old route id until the file was saved. The plugin's loader rule now matches every JavaScript module outside `node_modules` (the loader leaves modules that are no routes as they are), so a file stays one module when it becomes a route or stops being one. Because the loader is now part of every app module's request, webpack's and Rspack's deterministic module ids of the modules that are no routes change with this release, and under pnpm (or any install whose paths hold the package version, such as Yarn Plug'n'Play) with each later update of the plugin too, since the loader's path is part of every request; with npm's `node_modules` layout they change once. The code does not change.
