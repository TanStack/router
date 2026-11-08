---
'@tanstack/start-plugin-core': patch
---

fix: Rsbuild dev SSR now includes stylesheet links when the server environment runs outside the build process, such as in workerd with `rsbuild-plugin-cloudflare`. The dev manifest is written into the server's manifest module instead of being stored on the build process's `globalThis`.
