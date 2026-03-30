---
'@tanstack/router-core': patch
---

Fix preload from continuing into child `beforeLoad` and `head` handlers after a parent `beforeLoad` fails.
