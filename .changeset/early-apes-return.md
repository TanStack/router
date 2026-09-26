---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Allow React Link to pass its rendered source separately to buildLocation without mutating its destination snapshot, preserving explicit source overrides and location caching.
