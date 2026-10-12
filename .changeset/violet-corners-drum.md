---
'@tanstack/start-plugin-core': patch
---

Publish only validated public page fields in pages.json and sitemap.xml so prerender headers and other private page data, including extra data returned by `prerender.onSuccess`, stay private. Invalid sitemap metadata returned by `prerender.onSuccess` now fails the build instead of being written to sitemap.xml without validation.
