---
'@tanstack/start-plugin-core': patch
---

fix(start-plugin-core): keep the prerender trailing slash off the query string

The crawler applied `withTrailingSlash` to the full path including the query string, so the slash landed inside the last search-param value and, with `crawlLinks` enabled, sent the crawl into an infinite loop. Passing ufo's `respectQueryAndFragment` flag keeps the slash on the path.
