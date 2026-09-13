---
'@tanstack/start-server-core': patch
'@tanstack/router-core': patch
'@tanstack/history': patch
---

Use lightweight request history for SSR and make server navigation a no-op. Use redirect() to issue HTTP redirects. Server hrefs use the same normalization as browser history to handle protocol-relative URLs and control characters.
