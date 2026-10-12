---
'@tanstack/router-plugin': patch
---

Build the route HMR and React Refresh code the plugin inserts during development directly instead of parsing it, for faster dev transforms. The inserted code is also smaller: it no longer carries comments, redundant parentheses or a few intermediate variables and wrappers, and behaves the same.
