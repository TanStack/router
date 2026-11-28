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
- Warnings are on a compilation when it seals, and each report (a build's, each `build --watch` rebuild's, a dev server's until it printed them once) has each warning once. A `build --watch` rebuild prints a warning of a module it kept, also when only the server compiled again, and so does the error of an invalid custom server function id. An app plugin that reads a compilation's warnings once it sealed (a "no warnings" policy) sees Start's. When the client and server compilations overlap in a dev server, a package's "does not declare Start" warning is in the first report that can show it. A warning about a module a worker built by a child compiler imports is printed once, at its file, whatever the worker plugin does with the child's warnings, also from the persistent cache.
