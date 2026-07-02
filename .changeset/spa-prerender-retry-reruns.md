---
"@tanstack/start-plugin-core": patch
---

fix(start-plugin-core): make prerender retries actually re-run

The prerender crawler tracks visited paths in a `seen` set, and
`addCrawlPageTask` early-returns for any path already in it. On a retry it
re-invoked `addCrawlPageTask` for the same path, which the guard rejected, so
the retry never re-ran — the page was silently dropped and `failOnError` was
never reached. As a result `retryCount`/`retryDelay` had no effect, and a
transient fetch failure (e.g. the preview server not yet accepting connections)
produced "Prerendered 0 pages" while the build still exited 0. Delete the path
from `seen` before re-queuing so retries genuinely re-fetch.
