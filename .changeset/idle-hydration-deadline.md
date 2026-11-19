---
'@tanstack/react-start-client': patch
'@tanstack/start-client-core': patch
---

Keep pending React idle hydration scheduled across parent rerenders when its timeout is unchanged. Preserve rescheduling when the timeout or strategy changes and cancel pending work on unmount.
