---
'@tanstack/router-core': patch
---

- A route whose `context` fails keeps the context it inherited (the parent context, router context included), as a failed `beforeLoad` does: on its error match after a client navigation, and on its pending match while hydration recovers. Before, that match had an empty context, so `head`, the error component and the pending component lost the router context.
- In development, hydration warns when it hands a failed route to the client load, naming the route, and when it ignores a failure on a route the server rendered as an error or not-found (a failing `context`, or a throwing `context`, `beforeLoad` or `loader` `hydrate`), naming the route and the lifecycle. The second warning is not printed for a route the client load runs again.
- In development, calling a lazily imported object-form loader fails with an error that says to write it in the route file.
