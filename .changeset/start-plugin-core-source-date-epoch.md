---
'@tanstack/start-plugin-core': patch
---

Honor `SOURCE_DATE_EPOCH` when writing `sitemap.xml` and `pages.json`, so a build from the same sources is byte-identical: when it is set, the default `lastmod` (for pages that declare none) and `lastBuilt` come from that timestamp instead of the wall clock.
