---
'@tanstack/start-plugin-core': patch
---

`vite build --watch`: a rebuild's server bundle now lists the chunks of the same rebuild's client build. The server read the start manifest while the client was still rebuilding, so its documents loaded the previous build's client files; the server now waits for the client rebuild a file event started, until its bundle is written or it fails.
