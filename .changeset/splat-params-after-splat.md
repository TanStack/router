---
'@tanstack/router-core': patch
---

Fix path param types: params declared after a splat (`$`) are no longer inferred, since the splat consumes the rest of the URL.
