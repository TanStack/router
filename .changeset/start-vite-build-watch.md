---
'@tanstack/start-plugin-core': patch
---

`vite build --watch` of a Start app builds the server once the client's first build is done, so the server's function resolver lists every function the client calls; a rebuild keeps them, and judges unchanged modules against what an edit changed in the modules they import.
