---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

Faster compiles: each module's compile no longer leaves behind an object that kept that module's analysis alive through later garbage collections, so the analysis is no longer promoted to the old generation. Route modules compile 16–19 % faster in Start apps and 24–26 % faster in Router apps (every compile of one pass over a generated 333-route app, routes split, measured in process). Files with many `<Hydrate>` boundaries whose children reach a long chain of helpers that leads back to the route compile up to 4× faster.
