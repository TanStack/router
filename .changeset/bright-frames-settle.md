---
'@tanstack/react-router': patch
---

Prevent a blank frame before zero-delay initial pending UI by using a
component-scoped React transition for match publication. Pending timing,
boundary selection, and rendered matches continue to come from the router
core.
