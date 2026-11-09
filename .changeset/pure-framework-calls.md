---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

React's `memo`, `forwardRef` and `lazy`, Solid's `lazy`, and Vue's `defineComponent` and `defineAsyncComponent` are known to have no side effects when called with arguments that have none, like the router's own APIs (`getRouteApi` & co.): a top-level `const Page = memo(Inner)` or `const Panel = defineComponent({ … })` only split code reads loads with its chunk even when a call that stays in the route module follows it (an inline `validateSearch: z.object({ … })`), instead of staying in the route module with a warning. They count when imported from the framework package itself, also under another name or as a namespace member (`import * as React from 'react'`); a re-export through one of the app's modules and a member of a default import (`import React from 'react'`) do not. Import protection counts a module whose top level only makes such calls as one without side effects.

In a TanStack Start client build, server-function, middleware and isomorphic-function builder chains with arguments that have no side effects (the arguments the client build removes do not count) are no side effect either: a page-only `createServerFn()…handler(…)` or `createMiddleware(…).client(…)` loads with the split chunk instead of staying in the route module with a warning. A link called on a `const` holding a builder stays a side effect, and the server build is unchanged.
