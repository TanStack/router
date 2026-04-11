---
'@tanstack/start-plugin-core': patch
---

Reuse previously discovered server function IDs across compiler instances so custom `generateFunctionId` values stay stable when duplicate IDs are deduplicated during build.

This fixes cases where different build environments could assign different deduped IDs to the same server functions, which could cause requests to resolve to the wrong handler.
