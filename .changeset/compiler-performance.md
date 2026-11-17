---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-generator': patch
'@tanstack/router-utils': patch
---

Faster builds and dev servers. On 333- and 1,485-route React and Solid apps, builds are 2.2–4.8× faster and dev cold start is 2.2–4.9× faster; Start builds end with 3–11× less heap.

- Production builds release an environment's compiler state as soon as that environment is built, so a build of several environments (client, SSR, then a server or RSC environment) no longer grows its heap with each one (#8794).
- A long-running dev server or `tsr watch` keeps a digest of each route file instead of its text, and an edit that leaves the route tree unchanged no longer goes over every route file.
