---
'@tanstack/router-plugin': patch
---

Respect bundler production mode when injecting code-splitting warnings into browser bundles, even when the host `NODE_ENV` is unset or different. Build-console warnings remain available.
