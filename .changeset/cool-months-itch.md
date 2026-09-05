---
'@tanstack/router-core': patch
---

Fix consumer typechecking with `skipLibCheck: false` by omitting the internal beforeLoad context field from published dehydrated match declarations.
