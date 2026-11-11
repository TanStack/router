---
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

Vite dev: the modules a file change makes out of date (an export of a shared module that becomes a server function, for example) are part of that change's hot update in every environment, without the dev server compiling each of them first: on a large app such an edit reached the browser in about 0.1 s instead of 2 to 4 s. A route whose registry entry changes is rebuilt in every environment, also right after a dev server restart. A module compiled while the files it reads kept changing no longer prints "Save the file again if the page looks wrong": it is rebuilt with the next file change (at once on Rsbuild and webpack).
