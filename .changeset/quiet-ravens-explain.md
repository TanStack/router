---
'@tanstack/router-generator': patch
---

Fix literal underscore route paths when they are nested under pathless layouts. Virtual `route()` paths now treat leading and trailing underscores as literal URL path characters, while physical file routes continue to use bracket escapes for literal underscore segments.
