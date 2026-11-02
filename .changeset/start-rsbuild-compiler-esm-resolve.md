---
'@tanstack/start-plugin-core': patch
---

Rsbuild: the Start compiler resolves the imports it follows, such as those of a module that re-exports `createServerFn`, as ES module imports. It used the loader's base resolver, so packages whose exports only list `import`, like `@tanstack/react-start`, failed to resolve and the build stopped.
