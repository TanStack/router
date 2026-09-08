---
'@tanstack/router-core': patch
'@tanstack/history': patch
---

Use full-document navigation when an output rewrite produces a cross-origin destination, including the public URL of a route mask.

Respect registered history blockers during document navigation, passing history locations and the requested push or replace action.
