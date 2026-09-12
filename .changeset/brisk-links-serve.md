---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Keep the Link location cache out of server bundles: `buildLocation` only creates, reads and writes it when `isServer` is false. Render React Links on the server without the extra prop copies and the forwarded-ref hook. Link SSR rendering is 20-40% faster in the Link benchmarks and the React Start SSR request loop about 7% faster.
