---
'@tanstack/router-plugin': patch
---

Fix React route HMR for webpack and rspack so it no longer imports `react-refresh/runtime`, avoiding failures when that optional dependency is not installed.
