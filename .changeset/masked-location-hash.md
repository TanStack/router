---
'@tanstack/router-core': patch
---

Keep the hash of the real location when a masked history entry is read back. The location stored in `__tempLocation` had its hash without the leading `#`, so `parseLocation` dropped the hash's first character each time (`anchor` → `nchor` → `chor`).
