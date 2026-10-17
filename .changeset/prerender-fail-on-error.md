---
'@tanstack/start-plugin-core': patch
---

Fix prerender failures with `failOnError` escaping as an unhandled rejection. A failed page was rethrown inside the prerender queue, whose task promises were never observed, so `prerender()` resolved and the build only failed because Node crashed on the unhandled rejection, without closing the preview server or logging through the prerender logger. The first failure now stops the remaining pages and rejects `prerender()`, so the build fails with a regular error.
