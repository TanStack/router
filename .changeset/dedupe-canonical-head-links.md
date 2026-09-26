---
'@tanstack/router-core': patch
---

Dedupe `<link rel="canonical">` across nested routes so a child route's canonical link overrides its parent's, matching how `meta` tags are deduped. Other link rels (`stylesheet`, `preload`, `icon`, …) are still allowed to repeat.
