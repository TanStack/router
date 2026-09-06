# React Start RSC

- For diagnostic slot previews and recursive payload transforms, validate supported shared-reference, deep, and cyclic inputs before timing them. Traversal state must actually bound repeated work; any reuse must preserve the consumer's serialization contract.
- Gate development diagnostics before constructing payloads, then measure their development cost. Treat replay needed by SSR and later serialization as a required lifetime until evidence shows retention beyond it; validate cancellation and request cleanup before calling it a leak.
