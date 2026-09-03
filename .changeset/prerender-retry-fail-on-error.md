---
'@tanstack/start-plugin-core': patch
---

Fix `prerender.retryCount` never actually retrying a failed page (the path was already marked "seen" on the first attempt, so the retry was silently dropped), and fix `prerender.failOnError` not failing the build once retries were exhausted (the queued task's rejection was never awaited, so it became an unhandled promise rejection instead of stopping the build).
