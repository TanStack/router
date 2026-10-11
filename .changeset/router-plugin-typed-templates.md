---
'@tanstack/router-plugin': patch
---

Build the route HMR and React Refresh code the plugin inserts during development directly instead of parsing it, for faster dev transforms. `handleRouteUpdate` is now inserted as written in the plugin's source.
