---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

When Start removes code meant for the other environment (a server function's handler on the client, `createServerOnlyFn`/`createClientOnlyFn`/`createIsomorphicFn` implementations, `.server()` middleware, a stripped `<Hydrate>` fallback, a `deleteNodes` route option), a top-level statement that writes a binding only that code read (`flags.newUi = true`, `list.push(register())`, `db = connect()`, `state.title = 'x'`) now stays and runs, as it did before the compiler rewrite. It used to be removed with the binding, silently dropping changes it made elsewhere: to another module's object, to the document, through a setter or a method of your own, or a call in the written value. Declarations only removed code reads are still removed.

A statement that fills a container only server code reads (`handlers.set('a', serverThing)`) therefore keeps its import on the client. To leave it out, build the container in its declaration (`new Map([['a', serverThing]])`) or move it to a `.server` file.
