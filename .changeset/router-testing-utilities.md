---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
---

Add experimental, typed test utilities for routes, exported from `@tanstack/react-router/testing`, `@tanstack/solid-router/testing` and `@tanstack/vue-router/testing`. Both return a router to render with `RouterProvider`.

`createTestRouter` takes the options of `createRouter`, plus `location` and `overrides`, and creates a router over a copy of the app's route tree. Every route runs the app's own lifecycle unless an override for its id replaces `beforeLoad`, `loader`, `context` or a component option, or seeds its `loaderData` or `routeContext`.

`createIsolatedTestRouter` renders one element inside one route with the params, search, context and loader data the test supplies. No `context`, `beforeLoad` or `loader` runs and no route component renders. Everything a test passes is typed from the route tree, so the state a route promises to its components is required by the types.

The implementation lives in `@tanstack/router-core/testing`; the framework packages are thin typed wrappers around it.
