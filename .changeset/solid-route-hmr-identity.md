---
'@tanstack/router-core': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/router-plugin': patch
---

Solid route HMR (development only): an edit shows. The router keeps the component it holds only when solid-refresh patches it in place: both values are solid-refresh proxies of the same component name and file, also for a split chunk imported again after a route update, so a split component mounts once per save on Vite. After a rename or a removed component in a split route, later edits show only after a reload: solid-refresh keeps the removed name and stops patching the module (solidjs/solid-refresh#88). A layout imported through a barrel that switches module is no longer kept as the old module's component. On Rsbuild and webpack, every Solid split chunk hands its exports to the route's lazy component when it evaluates again on its own, so a component option whose value changed (`const Page = flag ? Wide : Narrow`) shows its new value. A split chunk holding components carries the route file's leading `@refresh` pragmas (`// @refresh granular`), so solid-refresh keeps a split component's state where it keeps an unsplit one's. Route modules no longer carry the compile-time component identities (`unsplit`) in their development HMR block.
