---
'@tanstack/start-plugin-core': patch
---

Import protection: a build warns once about each denied file it mocks whose every importer is exempt (`exclude`, `ignoreImporters`) or outside the scope (`include`, `srcDirectory`), naming the file, its importers and the fix (import the file statically from an exempt module inside the scope). The warning is not a violation: `onViolation` is not called, and the `error` behavior does not fail the build.
