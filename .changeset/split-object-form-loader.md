---
'@tanstack/router-plugin': patch
---

A split `loader` written in object form (`loader: { handler, staleReloadMode }`) splits its `handler` the way a function loader is split: the handler and what only it uses load with the loader's chunk, and the object with its other options (`staleReloadMode`) stays in the route file, where the router reads them. A handler method that uses `this` stays with a warning, like a loader method. The object stays whole when it isn't written in the route options (`loader: loaderObject`), or when its `handler` is a getter or followed by a spread (#8753).
