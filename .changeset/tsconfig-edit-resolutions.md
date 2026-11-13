---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
---

Dev: an edit of a `tsconfig.json` / `jsconfig.json` (its `paths`) makes the compiler ask its resolutions again, as an edit of a `package.json` does. With a resolver that follows the edit (vite-tsconfig-paths), a server function built on a factory imported through a new path was compiled against the old answer until its file was saved again.
