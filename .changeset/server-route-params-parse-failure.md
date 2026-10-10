---
'@tanstack/start-server-core': patch
---

Respond with a 404 when a server route handler or its `params.parse` throws `notFound()`, instead of a 500. When `params.parse` throws on a route with a component, requests that explicitly accept `text/html` now render the page's not-found or error state, as they did before parsed params reached server handlers.
