---
'@tanstack/start-plugin-core': minor
---

Strip the lifecycle object-form keys each bundle never reads from the route options in the route file (written inline or held in a variable of the same file; the code-splitting guide lists the exact scope): the client build drops `context.dehydrate`, `beforeLoad.dehydrate` and `loader.dehydrate`; the server build drops `context.hydrate`, `beforeLoad.hydrate`, `loader.hydrate` and `context.revalidate`. Imports used only inside a removed key are removed with it.

A `codeSplittingOptions.deleteNodes` list in your Start router config now applies to the client and the server build of both Vite and Rsbuild, with the built-in entries added after it. Before, Vite's client build replaced it with `['ssr', 'server', 'headers']` and Rsbuild ignored it in both builds, so keys you list there are now removed from builds that kept them.
