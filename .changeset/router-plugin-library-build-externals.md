---
'@tanstack/router-plugin': patch
---

Fix the Vite plugin failing a library build (`build.lib` with `external` dependencies) at the end of the build: the report of split exports that an entry chunk still holds walked the entry's imports, which also name the external packages, and read a chunk that does not exist (`Cannot read properties of undefined (reading 'modules')`).
