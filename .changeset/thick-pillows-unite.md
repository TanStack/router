---
'@tanstack/router-core': patch
---

Encode internal route IDs in the SSR asset manifest so crawlers parsing inline scripts do not discover them as nonexistent URLs. Restore the keys during hydration and accept manifests from older servers.
