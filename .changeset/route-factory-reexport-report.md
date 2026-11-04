---
'@tanstack/router-plugin': patch
---

A route file whose `createFileRoute` (or another route factory) is imported from a module of the app that re-exports the router's is now reported, naming the file and the fix (`import { createFileRoute } from '@tanstack/react-router'`): only the router's own export is recognised, so such a route is not code-split or hot-updated. Under TanStack Start the client build fails instead, since the route's `server`, `ssr` and `headers` options could not be removed from it.
