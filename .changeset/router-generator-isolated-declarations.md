---
'@tanstack/router-generator': patch
---

Add an `isolatedDeclarations` option that annotates the generated route tree, so it passes TypeScript's `isolatedDeclarations` check without changing its types.
