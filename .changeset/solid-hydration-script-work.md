---
'@tanstack/solid-router': patch
'@tanstack/solid-start-client': patch
---

Avoid duplicate external script execution when a Solid script includes both `src` and children. Reuse each Solid hydration boundary's marker element instead of scanning all document markers on mount.
