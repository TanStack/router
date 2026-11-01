---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Rspack, webpack and Rsbuild source maps hold the original text of every file the compilers transform (route files and their split chunks, Start modules, `<Hydrate>` chunks), so devtools and error trackers show the file as written instead of the transformed code. In development the text is added to the emitted map files, after the bundler hashed the modules: an edit hot-updates only the modules whose code changed. With a devtool that puts maps inside the code (`eval-*`, `inline-*`), the module maps carry it.
