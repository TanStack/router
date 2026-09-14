---
'@tanstack/react-router': patch
---

`useLinkProps` no longer calls through an internal wrapper. The host element `Link` renders on is an `@internal` overload parameter that is stripped from the published declarations, so the public `useLinkProps(options, forwardedRef?)` signature is unchanged.
