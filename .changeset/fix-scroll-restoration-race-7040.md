---
"@tanstack/router-core": patch
---

fix(scroll-restoration): capture restoreKey at scroll-event time to prevent race condition

The `onScroll` throttle was reading `router.state.location` when the throttled
callback executed (up to 100ms later), not when the scroll event actually fired.
If the user scrolled and then immediately navigated, the throttle could fire after
`router.state.location` had already changed to the new route, saving the old
page's scroll position under the new page's cache key.

Two fixes:
1. Capture `restoreKey` eagerly at scroll-event time by separating the event
   listener from the throttled save function. The throttle receives the key as
   an argument so it always writes to the key that was active when the scroll
   happened.
2. Clear any stale cache entry for the destination key before calling
   `restoreScroll()` in the `onRendered` subscriber, guarding against
   browser-generated scroll events that fire during DOM transitions after
   `router.state.location` has already advanced.

Fixes #7040
