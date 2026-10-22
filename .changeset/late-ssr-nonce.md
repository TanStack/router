---
'@tanstack/router-core': patch
---

Apply an `ssr.nonce` set after the router's SSR utilities are attached (for example in the `createStartHandler` callback) to the hydration scripts again.
