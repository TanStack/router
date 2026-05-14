---
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
'@tanstack/start-fn-stubs': patch
---

add createCsrfMiddleware based on Sec-Fetch-Site header, auto-apply to unconfigured servers, warn for others
