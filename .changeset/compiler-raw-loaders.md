---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

The router plugin's webpack/Rspack loader and Start's Rsbuild loader are raw loaders: a module they do not compile goes on to the bundler as the bytes it came as. A binary file with a JavaScript extension imported as an asset (an MPEG transport stream segment named `.ts`, with `type: 'asset/resource'`) was decoded as UTF-8 and emitted corrupted (752 bytes in, 1,502 out); it is now emitted unchanged, and a file the loaders pass through keeps its byte order mark.
