---
'@tanstack/start-plugin-core': patch
---

Rsbuild with `performance.buildCache`: a build after a source edit no longer serves pages that link the previous build's client entry. The server's Start manifest came from a transform that Rspack's persistent cache restored, so every page loaded a missing script and never hydrated. The manifest module's source is now the client build's manifest.
