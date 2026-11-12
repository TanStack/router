---
'@tanstack/router-plugin': patch
---

Route options named through a `const` that other code in the route file also uses (`const z = options; z.server = …`, `export const defaults = options`) are no longer code-split or stripped of `deleteNodes` options: the build warns, as it does for options written to after their declaration. Before, a write through another name of the object (`z.server = …`) was not seen: the literal's `server` was removed, the write's stayed in the client output, and nothing was reported.
