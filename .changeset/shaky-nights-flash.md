---
'@tanstack/router-core': patch
---

Hand native scroll restoration back to the browser on pagehide, including entries entering BFCache, and reclaim manual restoration when a cached document resumes.
