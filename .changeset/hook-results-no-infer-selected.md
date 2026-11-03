---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Stop hooks such as `useLoaderData`, `useSearch` and `useParams` from inferring their result from the caller's expected type when no `select` is passed, so `const x: number = Route.useLoaderData()` is a type error again.
