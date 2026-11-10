---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

`vite build --watch`: an import the resolver marks external (a server build's packages) is remembered as an answer, so a file appearing or disappearing no longer asks the resolver again about every package import of every module; a `package.json` or `tsconfig` change still does.
