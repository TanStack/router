---
"@tanstack/start-plugin-core": patch
---

fix(start-plugin-core): replace isRunnableDevEnvironment instanceof check with duck-typing to avoid dual-package hazard when vite is aliased (e.g. vite-plus pnpm override)
