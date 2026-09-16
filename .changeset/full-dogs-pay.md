---
'@tanstack/router-core': patch
---

Preserve the incoming public query when checking canonical URLs. SSR now redirects noncanonical search strings before rendering, avoiding duplicate hydration loads and redirect loops with custom search serialization. SPA mounts replace the URL through the existing Transitioner.
