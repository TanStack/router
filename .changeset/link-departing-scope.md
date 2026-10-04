---
'@tanstack/react-router': patch
'@tanstack/router-core': patch
---

Links of a route that the pending navigation leaves skip deriving the destination location, and clicks and preloads follow the href a Link displays. `buildLocation` now builds `mask` and `routeMasks` locations from the same `_fromLocation` as the destination.
