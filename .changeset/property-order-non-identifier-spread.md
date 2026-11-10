---
'@tanstack/eslint-plugin-router': patch
---

Fix `create-route-property-order` crashing with `Unsupported spread element` when the route options spread anything other than an identifier, such as `...shared()`, `...opts.route` or `...(flag ? a : b)`. These spreads are now kept in place, like identifier spreads.
