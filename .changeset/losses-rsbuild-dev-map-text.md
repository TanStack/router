---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Rsbuild and Rspack dev: after an edit that leaves a lazily loaded chunk's code unchanged (an edit of a split route's loader leaves its split component's chunk as it was), a page reload or a new tab showed that chunk's source in browser DevTools as the file was before the edit. The dev server now serves every map with the file's current text. Start's server environment no longer puts the files' text into its map files unless Rsbuild writes them to disk (`dev.writeToDisk`): Rsbuild runs the server bundles from memory, and Node never reads those maps, also with `--enable-source-maps`, so the text was work for no reader.
