---
'@tanstack/react-start-rsc': patch
'@tanstack/react-start': patch
---

Avoid requiring `Promise.withResolvers` in the RSC replay stream runtime so client bootstrap and hard refreshes do not fail in browsers that do not implement it.
