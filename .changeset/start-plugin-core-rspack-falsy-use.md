---
'@tanstack/start-plugin-core': patch
---

The Rsbuild RSC setup skips falsy entries of a rule's `use` list (allowed since `@rspack/core` 2.2.9, e.g. `use: [cond && 'x-loader']`) when it enables React Server Components on the SWC loaders, instead of reading them as loaders.
