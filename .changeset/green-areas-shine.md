---
'@tanstack/router-core': patch
---

Prevent constructor fields in search parameters from crashing router initialization or client navigation, including null values and objects that shadow hasOwnProperty.
