---
'@tanstack/start-plugin-core': patch
---

Load Vite's separate bundled-dev runtime before the client entry to restore hydration, HMR, and client import protection on Vite 8.2.1 and later.

Wait for the bundled client rebuild using Vite's updated dev-engine location before SSR, preventing stale client code and hydration mismatches after edits.
