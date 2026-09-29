---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Defer React Link active-state updates for predicted departing route owners using shared location snapshots. Keep href resolution live, preserve the existing location builder cache, and repair surviving owners after transaction settlement. Fix href-only destination changes and reloadDocument-only click updates without introducing per-Link dependency indexes.
