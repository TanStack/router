---
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

Fix a Vite build that hung on a `virtual:` module with a server-only marker or virtual modules importing each other. An Rsbuild persistent cache no longer restores the output of another version of the compiler. A `Route` merged with a namespace warns that it isn't code-split.
