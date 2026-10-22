---
'@tanstack/history': patch
---

Keep updating the URL after a native `pushState` / `replaceState` call throws once in browser history. Previously the queued action was never cleared, so no later navigation reached the address bar until a reload.
