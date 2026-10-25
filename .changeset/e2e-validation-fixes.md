---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-client-core': patch
---

Fixes found by the e2e apps on the new compiler: a route module starting with a comment no longer declares its generated bindings twice when its first import is rewritten; the Rsbuild RSC server build keeps the import of a server function's SSR stub; neighbouring destructured locals that only `<ClientOnly>` children read are removed without a build error; import-protection reports print a code frame again and Rsbuild traces follow scope-hoisted modules; client middleware sees only the server function's id during SSR.
