---
'@tanstack/router-core': patch
'@tanstack/solid-router': patch
'@tanstack/router-plugin': patch
---

Solid route HMR on Rsbuild, Rspack and webpack (development only): a split chunk imported again answers its newest evaluation. An edit of a loader grouped with the route component (`codeSplittingOptions.defaultBehavior: [['component', 'loader']]`) now shows, as does a route module edit after a conditional component switched (`const Page = flag ? Wide : Narrow`, then `staleTime`). This is a temporary workaround of Rspack's lazy compilation (web-infra-dev/rspack#16594): a later `import()` of a module that accepts its own updates, as solid-refresh makes every Solid chunk, answers its first namespace. A component the chunk handed over is kept when solid-refresh patched it, so such edits remount nothing more.
