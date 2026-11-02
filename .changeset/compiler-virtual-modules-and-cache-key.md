---
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

Fix a Vite build that hung on a `virtual:` module with a server-only marker or virtual modules importing each other, and one that kept a virtual module's old facts in `build --watch`. An Rsbuild persistent cache no longer restores the output of another version of the compiler. A type namespace named like a route or its options variable no longer stops the route being read. A server function nested in code that moves out of a route module links on Rsbuild with RSC.
