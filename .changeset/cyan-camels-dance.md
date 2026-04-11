---
'@tanstack/router-core': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
---

Reduce React Start SSR manifest payload size by omitting unmatched route assets from dehydrated router state while keeping start-manifest asset serialization deduplicated by shared object identity.

This improves SSR HTML size for apps with many routes that share the same CSS assets and adds regression coverage for CSS module hydration, navigation, and start-manifest asset reuse.
