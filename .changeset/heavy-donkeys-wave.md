---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix path param values starting with `$` being rewritten to "undefined" on full page load. The canonical-URL check on mount and on server startup no longer treats the current concrete pathname as a route template.
