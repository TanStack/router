---
'@tanstack/react-router': patch
---

Remove the extra SSR sentinel tag used for `onRendered` in React Router while
preserving the client-side render timing needed for scroll restoration and
`onRendered` subscribers.
