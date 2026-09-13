---
'@tanstack/router-core': patch
---

Reduce structural-sharing allocations by reusing array key storage and returning incoming objects when their children need no replacements. Preserve signed zero consistently, remove stale symbol properties, and keep sparse arrays with extra keys and built-ins with an own `constructor` opaque.
