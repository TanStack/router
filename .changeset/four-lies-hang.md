---
'@tanstack/history': patch
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Reduce React Link subscription work for fixed destinations by tracking their location dependencies through native stores. Preserve dynamic destinations, active search/hash behavior, and history formatting.
