---
'@tanstack/router-core': patch
---

Don't reset scroll when a server-rendered page hydrates, so the page keeps a position the user scrolled to before hydration finished.
