---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
---

Add typed test utilities for routes, exported from `@tanstack/react-router/testing`.

`createRouterTesting({ routeTree })` returns two helpers. `createTestRouter` creates a router over a copy of the app's route tree: every route runs the app's own lifecycle unless the test replaces `context`, `beforeLoad`, `loader` or a component option for that route id, or seeds its context or loader data. `renderInRoute` renders one element inside one route with the params, search, context and loader data the test supplies; no `context`, `beforeLoad` or `loader` runs and no route component renders. Everything a test passes is typed from the route tree, so the state a route promises to its components is required by the types.

The framework-independent part is exported from `@tanstack/router-core/testing`.
