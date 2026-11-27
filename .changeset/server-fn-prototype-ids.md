---
'@tanstack/start-plugin-core': patch
---

Treat server function ids that name `Object.prototype` members (`constructor`, `__proto__`, `toString`, ...) as unknown ids instead of failing with a `TypeError`.
