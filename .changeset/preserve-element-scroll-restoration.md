---
'@tanstack/router-core': patch
---

fix(router-core): preserve element scroll restoration in `scrollToTopSelectors`. An element whose scroll position was just restored is no longer reset to the top by the scroll-to-top fallback, mirroring how `windowRestored` suppresses the reset for the window.
