---
'@tanstack/start-plugin-core': patch
---

Fix prerendering in SPA mode skipping the route at the shell mask path. The SPA shell is prerendered from the mask path (`/` by default), and pages were deduplicated by path only, so the shell took the place of the `/` route: `index.html` was never written and `/` was left out of `sitemap.xml`, or, when `/` was listed in `pages` without static path discovery, the shell itself was skipped. The shell is now tracked separately from the route it is rendered from, unless both are written to the same file (for example `spa.prerender.outputPath: 'index.html'`), in which case the shell still owns that file.
