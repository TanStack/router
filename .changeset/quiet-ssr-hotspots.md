---
'@tanstack/router-core': patch
'@tanstack/start-plugin-core': patch
---

Reduce per-request SSR overhead: abort settled route matches with one shared reason instead of building a stack-capturing `DOMException` per match, skip `JSON.parse` for search values that cannot start JSON, wait on request signals with one listener per wait, and keep resolved server-function modules in production builds instead of re-importing them on every call.
