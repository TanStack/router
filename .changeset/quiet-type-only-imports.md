---
'@tanstack/start-plugin-core': patch
---

Ignore fully type-only imports and re-exports when collecting import-protection sources so type-only references to protected modules do not trigger violations.
