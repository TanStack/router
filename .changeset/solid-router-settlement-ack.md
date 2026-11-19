---
'@tanstack/solid-router': patch
---

Resolve the `router.startTransition` render acknowledgement when the commit's transition actually settles instead of immediately after flush. View transitions, `onRendered` (scroll restoration), pending minimum-display timing, and `status: 'idle'` now observe the committed swap instead of firing against held DOM; superseded or rolled-back commits acknowledge `false` instead of leaking. Synchronous navigations still acknowledge within the same flush.
