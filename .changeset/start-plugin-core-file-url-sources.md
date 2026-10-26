---
'@tanstack/start-plugin-core': patch
---

Fix import protection naming the original file of a violation on Windows when another plugin's source map lists its sources as `file://` URLs: the location read the URL's pathname (`/D:/app/src/page.mdx`) instead of the file path (`D:/app/src/page.mdx`).
