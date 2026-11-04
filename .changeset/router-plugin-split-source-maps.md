---
'@tanstack/router-plugin': patch
---

Source maps of split routes now point at the route file. On webpack and Rspack (including Rsbuild), a split component or shared code mapped to the wrong line, because unplugin's loader dropped the router plugin's map; `unplugin` now requires `^3.5.0`, which keeps it. The maps of split and shared modules also name the route file itself instead of its `?tsr-split` / `?tsr-shared` module id, so debuggers bind breakpoints set in the route file.
