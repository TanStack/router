---
'@tanstack/router-core': patch
---

Stop forcing `history.scrollRestoration = 'manual'` when scroll restoration is enabled. The browser's native restoration runs before first paint, so forcing manual mode broke iOS Safari swipe-back previews and made Chrome paint at the top and snap down on hard refresh; the router's own restoration still runs afterwards and still restores individual scroll containers.
