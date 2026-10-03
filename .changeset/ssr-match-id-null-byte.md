---
'@tanstack/router-core': patch
---

Encode dehydrated SSR match IDs with the replacement character instead of a null byte, so the inlined hydration payload no longer contains U+0000 (which is invalid in HTML and rejected by markup validators)
