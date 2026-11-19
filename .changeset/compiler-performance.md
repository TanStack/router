---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-generator': patch
'@tanstack/router-utils': patch
---

Faster builds and dev servers. On 333- and 1,485-route React and Solid apps, builds are 2.2–4.8× faster and dev cold start is 2.2–4.9× faster; Start builds end with 3–11× less heap.

- Production builds release an environment's compiler state as soon as that environment is built, so a build of several environments (client, SSR, then a server or RSC environment) no longer grows its heap with each one (#8794).
- A long-running dev server or `tsr watch` keeps a digest of each route file instead of its text, and an edit that leaves the route tree unchanged no longer goes over every route file.
- On Vite, dependency modules (`node_modules`) no longer pass through the router plugin's transform: Vite and Rolldown leave them out natively, as the webpack and Rspack loader rule does. A build no longer hands every dependency's source to the plugin to leave it unchanged (LibrePhotos: 9,763 of 10,950 calls, for 107 route files), which lowers build peak memory.
- On Rsbuild, Start's client manifest (route preloads and stylesheets), computed after every client compilation, no longer reads the module graph of the entry chunk and stops reading a chunk's modules once it has found every chunk it can import: 3–4× faster per compilation. In dev, an edit shows 37–40% sooner on a 1,485-route app (215–268 ms) and 27–35% sooner on a 338-route app.
