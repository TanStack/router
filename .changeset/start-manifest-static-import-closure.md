---
'@tanstack/start-plugin-core': patch
---

Walk the static import graph when building route preloads so Rolldown and Rsbuild builds preload every dependency chunk, and derive Rsbuild chunk imports from the module graph so shared chunks no longer attach unrelated route CSS to the SSR response.
