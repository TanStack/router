---
'@tanstack/start-client-core': patch
---

A server function or middleware builder's `.options` is now typed read-only: writes such as `base.options.validator = …` or pushing to `options.middleware` are TypeScript errors, as the Start compiler already refuses them. Reading options by name (`base.options.method`, `const { method } = base.options`) keeps its types. Runtime behaviour is unchanged.
