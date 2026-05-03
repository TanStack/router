---
'@tanstack/start-server-core': patch
---

fix(start-server-core): fall back HEAD requests to GET then ANY per RFC 9110 §9.3.2
