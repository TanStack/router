---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
---

Experimental: Add route modules: workspace packages that own a subtree of file-based routes and are mounted into applications or other modules. The generated host route tree mounts a module root under a host route and type-checks the mount: a static mount path, no required search params above the module, the router context the module requires, and serializable lifecycle results in server-rendered applications. Module routes, links, navigation, redirects and hooks come from the module's generated route scope and take module-local paths and qualified route ids wherever the module is mounted; `getRouteApi` and route-bound hooks resolve the nearest installation. A module mounted under path params keeps the params of the current location in its own links, and `HostedRouter` types the links of code that mounts it. A module installed several times gets one copy of its routes per installation, with ids `<package>#<as>:/…`; module-local ids, destinations, redirects and not-found errors resolve to the installation of the route that uses them, and `InstallationRoutesById` types an installation's routes. Matches of module routes carry `localRouteId`, the installation-independent id, and the generated `isScopedMatch` guard narrows whole-router matches to the routes of a scope. Applications without route modules are unaffected.
