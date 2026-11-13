---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

The compiler checks whether rewritten code needs a `;` before it more cheaply: a module with a `<Hydrate>` boundary in the client build, or `<ClientOnly>` in the server build, no longer pays for a pass over its whole top-level statement. A comment the compiler keeps or inserts before a rewritten statement no longer gets an extra `;` in front of it. Outputs are otherwise unchanged.
