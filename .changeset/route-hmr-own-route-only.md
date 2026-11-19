---
'@tanstack/router-plugin': patch
---

Only let route HMR patch the route that the module itself exported. Matching by route id alone meant a route module from another app on the page, such as a Module Federation remote whose `__root__` or `/` shares an id with the host's, patched the host's route as soon as it loaded.
