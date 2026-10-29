---
'@tanstack/start-plugin-core': patch
---

Resolve the prerender paths against Vite's resolved `root` instead of `process.cwd()`. When the root is not the working directory, `vite build <dir>` and `createBuilder({ root })` previously failed to start the preview server or wrote `index.html`, `pages.json` and `sitemap.xml` outside the project.
