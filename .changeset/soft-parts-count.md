---
'@tanstack/router-core': patch
'@tanstack/router-devtools-core': patch
---

Reuse parsed route segments when generating paths for navigation, Links, and Devtools. Preserve interpolation metadata and refresh segments when the route tree is rebuilt, without reparsing templates for new parameter values.
