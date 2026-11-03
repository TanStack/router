---
'@tanstack/start-plugin-core': patch
---

The prerender crawler treats a fragment link as the document it points into: `/docs#install` is `/docs`. Previously each such link became its own page — fetched and written a second time, and listed in `sitemap.xml` as a distinct URL alongside the page it lives on. Declared `pages` paths lose their fragment the same way.
