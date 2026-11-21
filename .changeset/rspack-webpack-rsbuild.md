---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Rspack, webpack and Rsbuild:

- The router plugin uses its own loader, so project paths with `'` or `#` build (#7754). Paths with `'` or `#` build on Vite too.
- The router plugin's loader rule matches every JavaScript module outside `node_modules` (it leaves modules that aren't routes unchanged), so a file stays one module when it becomes a route or stops being one. Because the loader is now part of every app module's request, the deterministic module ids of those modules change with this release, and under pnpm (or any install whose paths hold the package version, such as Yarn Plug'n'Play) with each later update of the plugin too; with npm's `node_modules` layout they change once. The code doesn't change.
- Start's Rsbuild loader passes a dependency's module it doesn't compile on as the bytes it came as: a package's binary file with a JavaScript extension imported as an asset (an MPEG transport stream segment named `.ts`, with `type: 'asset/resource'`) is emitted unchanged instead of corrupted, and a byte order mark is kept.
- Rsbuild and Rspack dev: a hot update holds only the outputs an edit changes. In a live session, browser DevTools keep a file's previous text after an edit that changes no output's code (a comment, a type) until a reload; a reload or a new tab shows the current text. Start's server environment puts the files' text into its maps only when Rsbuild writes them to disk (`dev.writeToDisk`): Rsbuild runs the server bundles from memory, and Node never reads those maps.
- Start on Rsbuild with `performance.buildCache`: a build after a source edit no longer serves pages that link the previous build's client entry. Rspack's persistent cache restored the server's Start manifest, so every page loaded a missing script and never hydrated.
- webpack and Rspack with a persistent cache: a build after a code-splitting configuration change the bundler's cache doesn't see (`tsr.config.json`, options computed from the environment, a bundler config outside `cache.buildDependencies`) splits routes as a build with a fresh cache does. The cache used to restore route modules split under the earlier groupings.
