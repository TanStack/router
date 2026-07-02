---
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
---

Fix custom serialization adapters for server functions called from client entry modules before hydration. Start options are now initialized once and reused by early client-side server-function calls, so custom adapters and Start-level server-function fetch options are available before the app hydrates.
