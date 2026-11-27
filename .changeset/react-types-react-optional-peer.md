---
'@tanstack/react-router': patch
'@tanstack/react-router-devtools': patch
'@tanstack/react-start-client': patch
'@tanstack/react-start-rsc': patch
'@tanstack/react-start-server': patch
---

Declare `@types/react` as an optional peer dependency. The published type declarations import `react`, so under strict package layouts (pnpm with `hoist: false` or its global virtual store, Yarn PnP) the React types now resolve instead of becoming `any`.
