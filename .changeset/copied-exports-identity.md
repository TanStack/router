---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Code splitting: a split chunk copies an exported binding of a route file only when the copy is a closure of functions and primitive constants nothing writes and whose identity nothing observes (`new`, `instanceof`, `===`). A class, an object or array literal, a call result, a regex, an enum or a written binding reached by the export is one instance: the chunk imports the extracted module, so `instanceof`, a context's Provider and consumer, a sentinel and a subscriber list behind exported functions hold across the route's split options and its importers in production builds, as they do in dev.
