---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix inline script deduplication during hydration when a CSP response header hides nonce attributes, preventing duplicate execution and Trusted Types errors.

Normalize an explicitly empty nonce consistently so identical inline scripts with `nonce=""` are also reused.
