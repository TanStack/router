---
'@tanstack/router-core': patch
---

Simplify path interpolation into ordered segment-type blocks with shared prefix/value/suffix assembly. Preserve one-pass parsing and optional metadata collection, and reuse the public result object instead of allocating and clearing a missing-parameter callback.
