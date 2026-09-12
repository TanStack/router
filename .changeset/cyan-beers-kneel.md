---
'@tanstack/vue-router': patch
---

Remove an unnecessary match Fragment to reduce VNode allocation and transient JIT compilation memory while preserving route content and scroll restoration.
