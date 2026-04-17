---
'@tanstack/router-core': patch
'@tanstack/solid-router': patch
---

Fix a navigation deadlock after SSR hydration where a loader write landing on a pending-pool store after the commit snapshot was read would be lost, leaving the match stuck in `status: 'pending'`. The commit now hands pending stores to the active pool by reference and reads their latest value.
