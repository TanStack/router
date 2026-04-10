---
'@tanstack/react-router': patch
---

Fix a stale route error boundary state issue that could briefly render the next route's `errorComponent` after navigating away from a failed route.
