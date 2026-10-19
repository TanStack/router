---
'@tanstack/router-generator': patch
---

Key the routes-by-file map under a route file's real path as well as its scanned path. When route files are symlinks (a Bazel sandbox, a pnpm-linked source tree, Nix), a bundler that resolves symlinks — Vite's default — hands the router plugin's transforms the real path, the lookup missed, and the code splitter silently skipped the client-side stripping of `server.handlers`, shipping server-only code and its imports into the client bundle.
