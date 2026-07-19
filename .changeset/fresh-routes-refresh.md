---
'@tanstack/router-plugin': patch
---

Preserve React component state during HMR when route components are declared with lowercase function names. The development-only React transforms cover split route component groups and unsplit root route component options, including shell, pending, and error components, without changing production output.
