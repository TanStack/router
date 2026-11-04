---
'@tanstack/router-plugin': patch
---

fix: webpack and Rspack production builds no longer put the code splitter's "will not be code-split" warning, with the route file's absolute path, into the client bundle when the build process's `NODE_ENV` isn't `production`. The bundler's mode decides, and a config without `mode` counts as production, as it does for webpack and Rspack. The warning still prints in the build output.
