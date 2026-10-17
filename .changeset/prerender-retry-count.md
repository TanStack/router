---
'@tanstack/start-plugin-core': patch
---

Fix `prerender.retryCount` never retrying a page. The retry re-entered the crawl step, which skipped the page because it had already been seen, so a page that failed once was dropped without being retried or reported, even with `failOnError` enabled. Failed pages are now requested again up to `retryCount` times.
