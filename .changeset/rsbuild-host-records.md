---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Start on Rsbuild: what a compile leaves besides the module (its record, the server-function registry, the modules Start generates, the warnings) now follows four rules, each with one writer.

- A build or a dev server on a primed persistent cache no longer builds the client route tree, the server-function resolver or the Start manifest again when they were built from the current content: on an app of about 450 modules, a warm build is 3% faster and a warm dev start 2% faster. An app's own transform on `routeTree.gen.ts` runs when the tree is built, so not on an unchanged restore.
- A second `createDevServer()` on one Rsbuild instance serves its own Start manifest and server-function resolver.
- A second `build()` on one Rsbuild instance with the persistent cache serves its own client files: the page no longer links the JS files of the first build.
- A dev server drops a server function, and its file, from the server compilation once the last import of it is removed, as on Vite: a later save of the file no longer builds it on the server. With RSC, `build --watch` drops a server function whose only caller an edit removed, as a new build does.
- A module the client gets as its import-protection mock no longer registers its server functions.
- In `build --watch`, an installed package's server-only module edited to drop its marker no longer reports a violation.
- Warnings print once per build run and once per dev session. A development-mode `build --watch` rebuild now prints a warning of a module it kept, as a production-mode one does. When the client and server compilations overlap in a dev server, a package's "does not declare Start" warning is in the first report that can show it. A worker built by a child compiler no longer silences the page's warning about a package they share, whether or not the worker plugin passes the child's warnings on. A warning about a module only the worker imports still prints when the worker plugin passes it on.
