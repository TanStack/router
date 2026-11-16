---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

Route splitting keeps a class, enum or namespace that only split options read in the route module, as main does, and each chunk that reads it copies it. Its static blocks, static field initialisers, decorators, namespace body and the imports it reads run when the route module loads again, so a loader that reads their effect sees it on the first visit.
