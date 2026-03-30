---
'@tanstack/router-plugin': patch
---

Initialize `import.meta.hot.data` before storing stable split components so Vitest does not crash when HMR data is missing.
