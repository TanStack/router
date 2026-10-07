---
'@tanstack/start-server-core': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Preserve the algorithm helper referenced by public session declarations. Expose router configuration through a dedicated public entry and use it in Start so configuration declarations do not pull in every optional bundler adapter.
