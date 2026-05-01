---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Replace global route metadata with explicit router plugin contexts so multiple router plugin instances cannot cross-transform route files.
