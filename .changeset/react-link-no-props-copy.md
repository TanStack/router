---
'@tanstack/react-router': patch
---

Links mount faster. `Link` calls `jsx` from `react/jsx-runtime`, so React 19 uses its props object for the element without copying it. As with JSX elsewhere in React 19, `defaultProps` of a function component passed to `createLink` are no longer applied; use default parameters instead.

Links without intent preloading no longer wrap `onFocus`, `onBlur`, `onMouseEnter`, `onMouseLeave` and `onTouchStart`. Those handlers are attached as given, so they also run for events that were already prevented, as on a plain `<a>`.
