---
'@tanstack/router-generator': patch
---

Fix duplicate identifiers in the generated route tree when a virtual route config mounts `physical()` directories under different parents. A mounted file's variable name now includes the parent route's path, as the route id already did, so `route('/a', [physical('', 'a')])` and `route('/b', [physical('', 'b')])` with an `index.tsx` in each generate `AIndexRoute` and `BIndexRoute` instead of `IndexRoute` twice.
