---
'@tanstack/router-core': minor
---

Add `inheritSearch: true` to explicit and configured route masks to reuse the fully resolved destination search and its encoded query without running mask search processing. Ordinary masks retain their existing search behavior; combining inheritance with a mask search option is rejected.
