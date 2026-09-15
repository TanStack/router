---
'@tanstack/start-server-core': patch
'@tanstack/start-plugin-core': patch
---

Use build-time route information to skip server-route handling for apps without a `server` option on any route. Skip the request middleware chain when none are configured, and keep early route matching when needed for early hints.
