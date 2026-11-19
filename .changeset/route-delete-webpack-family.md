---
'@tanstack/router-plugin': patch
'@tanstack/router-generator': patch
---

Deleting or renaming a route file while webpack or Rspack/Rsbuild watches no longer fails a build with `Can't resolve` from the route tree, and on webpack a route file re-created right after its deletion is served again: the compilation of the change now builds the route tree (and the route files the generator rewrote) from what the generator wrote.
