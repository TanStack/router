---
'@tanstack/start-plugin-core': patch
---

Import protection covers asset queries: `?raw`, `?url`, `?inline`, `?worker` and `?sharedworker` of a denied file or of a file with a `server-only` marker give the client the mock, never the file's text, in a plain import or through a pattern (`import.meta.glob`, a template-literal `import()`, `import.meta.webpackContext`), on Vite and Rsbuild. On the client, a denied file is judged wherever it lives, also outside `srcDirectory`, when a pattern reaches it, and a non-code denied file is judged through a plain glob (Vite) or `new URL` (Rsbuild). Still not covered, as on main: a marked file the compiler can't read its marker from (a language it doesn't know, or one that does not parse) with an asset query, what a clean `?worker` imports, and `new URL` of a denied file on Vite.
