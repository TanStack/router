---
'@tanstack/start-server-core': patch
---

fix: cache resolved Start server entries and manifests instead of in-flight promises, so a cancelled Cloudflare Worker request can no longer leave later SSR hanging
