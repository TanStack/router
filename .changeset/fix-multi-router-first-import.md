---
'@tanstack/router-plugin': patch
---

Only run the eager HMR route patch on hot re-evaluations of a route module. On a first import, a same-id route on `window.__TSR_ROUTER__` belongs to a different router in the same window (e.g. module federation host/remote), and patching it corrupted both route trees, causing "Invalid hook call" errors.
