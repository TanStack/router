---
'@tanstack/react-router': patch
---

Fix `CatchBoundary` so falsy thrown values (`undefined`, `null`, `''`) render the nearest `errorComponent` instead of escalating past every boundary and unmounting the app. The boundary now tracks that an error was caught separately from the thrown value's truthiness.
