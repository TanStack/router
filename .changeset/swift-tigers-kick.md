---
'@tanstack/history': patch
---

Preserve beforeunload warnings during back and forward navigation unless `ignoreBlocker` is requested. Clear the bypass after same-document traversal so later document navigation still warns about unsaved changes.
