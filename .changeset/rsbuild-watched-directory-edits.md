---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Rsbuild dev: a directory a plugin watches (Tailwind CSS adds the ones it scans) is no longer taken for a created file when Rspack reports it modified, and a created file asks again only the resolutions it may take. Under Yarn PnP the first route edit of such an app rebuilt a module of `@tanstack/start-client-core`, which Rspack then failed to resolve, breaking every later compile.
