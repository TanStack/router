---
'@tanstack/start-plugin-core': patch
---

Import protection covers asset queries: `?raw`, `?url`, `?inline`, `?worker` and `?sharedworker` of a denied file or of a file with a `server-only` marker give the client the mock, never the file's text, in a plain import or through a pattern (`import.meta.glob`, a template-literal `import()`, `import.meta.webpackContext`), on Vite and Rsbuild. A denied file is judged wherever it lives, also outside `srcDirectory` and whatever its file type, when a pattern or (Rsbuild) `new URL` reaches it.
