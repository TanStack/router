---
'@tanstack/start-plugin-core': patch
---

Rsbuild: a denied import in a module that a worker or service-worker plugin builds (a child compiler of the client build) fails the build with an import-protection error at the import, naming the importer and the denied file, and is reported to `onViolation`, instead of a build failure that printed nothing. A child compiler cannot load the mock, so this happens whatever the `behavior`.
