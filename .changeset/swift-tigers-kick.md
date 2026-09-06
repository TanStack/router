---
'@tanstack/history': patch
---

Respect `ignoreBlocker` during `go()` navigation, including document unload warnings. Preserve beforeunload warnings during back and forward navigation unless `ignoreBlocker` is requested, and clear the bypass after same-document traversal so later document navigation still warns about unsaved changes.

Restore the original browser history entry when forward or multi-entry navigation is blocked.
