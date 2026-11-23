---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

One policy for installed and workspace packages:

- A `server-only` or `client-only` marker is honoured in every file, a package's included, whatever `excludeFiles` says (it now skips file-name rules only). It denies the file to every importer that `exclude` or `ignoreImporters` does not exempt and `allowImport` does not allow: a module outside `srcDirectory`, and a package's module the compiler does not compile (reported at its import of the file), are violations too, no longer a mock with a warning. A bare import of a marked file is a violation where it survives, even under `"sideEffects": false`. For an importer the compiler does not compile, `allowImport` is asked about the marked file itself (`importer` and `resolved` are the file).
- `@tanstack/<framework>-start/server` is a server-only-marked module: a client use of it that the client keeps fails the build at the module that keeps it, in a package or a workspace package too, not only in the app's files. Stricter than before on Vite: a kept constant (`HEADERS`) or a dynamic `import()` behind a runtime guard Vite does not remove (`typeof window`, `isServer`) fails; guard it with `import.meta.env.SSR` or use it inside `createServerFn().handler()`, `createServerOnlyFn()`, `createIsomorphicFn().server()` or `createMiddleware().server()`. On Rsbuild, builds that failed on `node:async_hooks` for an import the client drops now build.
- A package declares Start with `@tanstack/<framework>-start`, `@tanstack/start-client-core`, `@tanstack/start-server-core`, `@tanstack/start-fn-stubs` or `@tanstack/<framework>-start-rsc` in `peerDependencies`, `dependencies` or `optionalDependencies` (`peerDependenciesMeta` alone does not count). Its modules are read like the app's: a builder one module hands to another under a new name is followed, and the app's handlers built on it leave the client. A package that uses Start without declaring it gets one warning.
- On Vite, the packages Start bundles for the server and keeps out of the optimizer are found through workspace packages, packages that declare Start and installed optional dependencies, by the name the importer wrote (npm aliases work). A Start package behind an ordinary installed package warns that the parent must be bundled (`ssr.noExternal`).
- A module the user lists in `exclude` or `ignoreImporters` is compiled, a package's included, so the denied file it imports is the real one with nothing reported. A route file the generator registered from a package is compiled like the app's (split, `server` handlers off the client).
- Rsbuild with RSC: a package's `'use client'` component that only a server component renders is checked; a server-only module it uses on the client fails the build instead of shipping its mock.
- With RSC on Vite, a package whose export conditions give the browser and the server different files must re-export one module that defines its server functions: a function defined in each fails the build, naming the browser's file.
