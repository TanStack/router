---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Do not reload the page when Firefox or Safari cancel a pending route chunk because the user is leaving the page. The cancellation has the same message as a missing chunk, and the stale-deploy reload replaced the user's navigation. If the page stays after all, the chunk import is retried.
