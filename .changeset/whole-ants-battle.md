---
'@tanstack/router-core': patch
'@tanstack/router-devtools-core': patch
---

Share compact parsed route segments between matching and interpolation, preserve original parameter names, and avoid reparsing templates while building paths. Simplify route-tree traversal, reuse existing path helpers, and keep Devtools-only navigation validation out of the production formatter. Preserve dynamic match identity for standalone legacy fallback routes.
