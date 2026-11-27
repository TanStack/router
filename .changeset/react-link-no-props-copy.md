---
'@tanstack/react-router': patch
---

Links mount faster. `Link` renders through `react/jsx-runtime`, so React 19 uses its props object for the element without copying it. Links without intent preloading no longer attach focus, hover and touch handlers; their own handlers still pass through unchanged.
