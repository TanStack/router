---
'@tanstack/router-core': patch
---

Skip JSON.parse for search values that cannot be valid JSON (e.g. dates, digit-leading ids).
