---
'@tanstack/start-server-core': minor
---

Add `createSitemapHandler`, `createSitemapIndexHandler` and `createRobotsHandler` for serving dynamic `sitemap.xml`, sitemap indexes and `robots.txt` from server routes, plus the underlying `renderSitemap`, `renderSitemapIndex` and `renderRobots` serializers. Entries follow the Next.js `MetadataRoute` shape, XML is escaped and schema-ordered, and relative URLs resolve against the request origin or an explicit `baseUrl`.
