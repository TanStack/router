---
'@tanstack/start-plugin-core': patch
---

Start's router options now reach the route generator and the code splitter as they do in a router app:

- Generator plugins given as `router.plugins` run (#7768). Start's own generator plugins used to replace them.
- A function-form `router.routeTreeFileFooter` is called at every print of the route tree. Start's Vite plugin used to print its first result for the whole dev server.
- Start's Rsbuild plugin keeps `router.codeSplittingOptions.deleteNodes` for the server build. It used to drop the option there.
- Start's Vite plugin finds the client route tree by its exact module id (#8839). With a regular-expression character in the project path, such as `+`, the client used to get the full route tree, server-only routes included; a file whose name differed from the route tree's by one character (`routeTree-gen.ts`) was replaced by the client route tree.
