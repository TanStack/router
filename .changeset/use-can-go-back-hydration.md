---
'@tanstack/react-router': patch
---

Fix `useCanGoBack` reporting the browser history index during the hydration render, which contradicted the server markup and produced a hydration mismatch after a page refresh. The hook now defers to the server value while hydrating and reports the real history once hydration has settled.
