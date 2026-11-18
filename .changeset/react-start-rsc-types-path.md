---
'@tanstack/react-start-rsc': patch
---

Type declarations are published next to the JavaScript in `dist/esm/` (previously `dist/esm/src/`). The `exports` map points to the new location, so imports resolve the same types as before.
