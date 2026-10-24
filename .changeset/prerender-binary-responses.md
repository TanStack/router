---
'@tanstack/start-plugin-core': patch
---

Write prerendered server route responses as bytes. `res.text()` decoded every body as UTF-8, so prerendering a route that answers with an image or another binary payload wrote a corrupted file.
