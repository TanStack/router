---
'@tanstack/start-plugin-core': patch
---

A client build that reaches `.inputValidator()` on a server function or middleware builder now reports that the method was renamed to `.validator()` (#7566) and removed (#8694), instead of the generic "call the methods of a builder directly" error.
