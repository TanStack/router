---
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

Production builds release an environment's compiler state as soon as that environment is built, instead of keeping every finished environment's state until the whole build ends. A build of several environments (client, SSR, then a server or RSC environment) no longer grows its heap with each one (#8794).
