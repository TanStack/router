---
'@tanstack/router-core': patch
---

Fix consumer typechecking with `skipLibCheck: false` by omitting the internal beforeLoad context field from published dehydrated match declarations.

Retain the exported `isAbsoluteUrl` declaration used by framework bindings so the package entry point does not reference a stripped symbol.
