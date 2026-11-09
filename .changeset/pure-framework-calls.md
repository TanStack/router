---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

React's `memo`, `forwardRef` and `lazy`, Solid's `lazy`, and Vue's `defineComponent` and `defineAsyncComponent` are known to have no side effects when called with arguments that have none, like the router's own APIs (`getRouteApi` & co.): a top-level `const Page = memo(Inner)` or `const Panel = defineComponent({ … })` only split code reads loads with its chunk even when a call that stays in the route module follows it (an inline `validateSearch: z.object({ … })`), instead of staying in the route module with a warning. They count when imported from the framework package itself, also under another name or as a namespace member (`import * as React from 'react'`); a re-export through one of the app's modules and a member of a default import (`import React from 'react'`) do not. Import protection counts a module whose top level only makes such calls as one without side effects.
