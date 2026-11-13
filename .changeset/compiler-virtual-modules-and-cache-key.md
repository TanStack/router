---
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

An Rsbuild persistent cache no longer restores the output of another version of the compiler. A type namespace named like a route or its options variable no longer stops the route being read. A server function nested in code that moves out of a route module links on Rsbuild with RSC.
