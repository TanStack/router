---
'@tanstack/history': patch
---

Ignore pending traversal blocker answers after a newer popstate event or accepted history write. Skip the restore when a blocked traversal has no index difference, since `go(0)` and `go(NaN)` reload the document.
