---
'@tanstack/start-plugin-core': patch
---

fix: prerendering a server route that returns binary content (for example an image) now writes the response bytes unchanged instead of a UTF-8 re-encoded, corrupted file.
