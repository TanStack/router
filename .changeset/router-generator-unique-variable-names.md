---
'@tanstack/router-generator': patch
---

Route files whose paths derive the same variable name, such as the pathless layout `_auth.tsx` next to `auth.tsx`, or `user-settings.tsx` next to `user.settings.tsx`, no longer declare the same identifier twice in `routeTree.gen.ts`. The later file gets a numbered name (`Auth2Route`).
