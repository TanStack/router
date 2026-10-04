---
'@tanstack/history': patch
---

Keep a leading query or fragment out of the parsed pathname, so hash-history URLs like `/#?x=1` no longer repeat the query in the router location.
