---
'@tanstack/router-core': patch
---

Fix async loaders that throw or return `notFound()` so they do not briefly mark the match as `success` before the final not-found boundary is resolved.

This prevents route components from rendering with missing loader data during navigation when React observes the intermediate match state before not-found finalization completes.
