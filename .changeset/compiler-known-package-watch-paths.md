---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
---

The compiler no longer reports a known package (e.g. `@tanstack/react-start`) as a file dependency: Rspack and webpack watched it as a missing path, reported it removed, and rebuilt every environment once after the first watch build.
