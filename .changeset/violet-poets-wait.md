---
'@tanstack/router-core': patch
---

Fix context value from a parent route's `beforeLoad` not being propagated to a sub-route while the sub-route's loader is reloading in the background
