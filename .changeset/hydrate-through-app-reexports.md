---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

`<Hydrate>` imported through the app's own modules re-exporting it (`export { Hydrate } from '@tanstack/react-start'`, an imported `Hydrate` exported again, `export *`, a namespace import, chains of these) now splits its children like a direct import, in React and Solid, Vite and Rsbuild. Before, it deferred hydration but its children's code loaded with the page. A re-export under another name, or one from an installed package, is still not followed.
