---
'@tanstack/start-plugin-core': patch
---

Import protection checks the imports a bundler expands from a pattern too: a denied file reached only through `import.meta.glob`, a template literal `import()` or `import.meta.webpackContext` is replaced by its mock and reported, in dev and in builds, on Vite and Rsbuild (a build names each module importing it, a dev server the denied file). Rsbuild builds with the `error` behaviour now fail on such an import, and Vite and Rsbuild dev servers report it (they used to mock it silently).
