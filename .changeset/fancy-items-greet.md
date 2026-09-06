---
'@tanstack/router-core': patch
---

Respect the router instance's effective server mode when applying the empty-search middleware shortcut. Preserve client search reuse, inherited search identity, and middleware-chain behavior.
