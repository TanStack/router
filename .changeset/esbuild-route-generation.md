---
'@tanstack/router-plugin': patch
---

The esbuild entry (`@tanstack/router-plugin/esbuild`) generates the route tree: at the start of every build and rebuild. It never ran the generator before, so an app without a committed route tree failed to build. Esbuild watches only the files of the bundle, so a route file created in watch mode joins the tree at the next rebuild (or run `tsr watch` next to it).
