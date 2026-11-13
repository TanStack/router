---
'@tanstack/router-utils': patch
---

Code splitting keeps a value read at load in source order with later writes in three more cases: a read through a holder when the split component also writes through it (the read stays, with a warning); a declaration another exported binding's module would hold, reading an exported object before a later write of it (it stays, with the exports it keeps); and a statement using an exported binding and a binding a split chunk takes with its write at load (it stays with both, with a warning at each, instead of an internal-invariant warning and an import cycle).
