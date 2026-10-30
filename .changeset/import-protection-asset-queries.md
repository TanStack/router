---
'@tanstack/start-plugin-core': patch
---

Import protection covers asset queries: `?raw`, `?url`, `?inline`, `?worker` and `?sharedworker` of a denied file or of a file with a `server-only` marker give the client the mock, never the file's text, in a plain import or through a pattern (`import.meta.glob`, a template-literal `import()`, `import.meta.webpackContext`), on Vite and Rsbuild. On the client, a denied file is judged wherever it lives, also outside `srcDirectory`, when a pattern reaches it, and a non-code denied file is judged through a plain glob (Vite) or `new URL` (Rsbuild).
