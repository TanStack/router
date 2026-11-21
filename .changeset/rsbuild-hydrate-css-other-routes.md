---
'@tanstack/start-plugin-core': patch
---

Rsbuild: a page no longer links the stylesheets of another route's `<Hydrate>` boundaries. When two or more lazy routes used `<Hydrate>`, the chunk they share (with `<Hydrate>`'s own code) was read as dynamically importing every boundary of every one of those routes, so each route's page linked the CSS of all the others' boundaries.
