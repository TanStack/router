---
'@tanstack/react-start-rsc': minor
---

RSC CSS injection runs in Start's compiler. Server functions that only a `'use client'` component imports are in the production manifest (#7943). With RSC, server function provider modules load only what their handlers reach, so a route module's client-only code no longer runs under `react-server`.

Removed `@tanstack/react-start-rsc/plugin/rscCssTransform` (the Babel transform).
