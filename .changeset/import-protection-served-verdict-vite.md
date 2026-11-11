---
'@tanstack/start-plugin-core': patch
---

Import protection on Vite: the dev server builds a denied file again when what it was served no longer matches its importers, as Rsbuild does: an exempt importer (or an import `allowImport` allows) read after a pattern import made the file a mock gets the real module (the page reloads), and an edit that removes the exempt import serves the mock without a restart. A Vite build compiles each module once, so when it compiled the denied file for a pattern import before it read the import that needs the file as it is, every importer gets the mock, and the build now says so under `behavior` (an error with `'error'`, a warning with `'mock'`), naming the file, the importer that needs it and the pattern to fix. A `vite build --watch` rebuild that kept a denied file as it is after its exempt import was removed says so the same way.
