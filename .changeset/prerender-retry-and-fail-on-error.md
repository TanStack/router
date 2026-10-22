---
'@tanstack/start-plugin-core': patch
---

Fix prerendering so that `retryCount` actually retries a failed page, and a page that still fails with `failOnError` enabled now fails the build instead of exiting successfully.
