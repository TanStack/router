---
'@tanstack/router-plugin': patch
---

Split only the `handler` of a loader in object form (`loader: { handler, staleReloadMode }`) when `loader` is code-split, and keep its other options on the route. Before, the split chunk failed with `Unexpected splitNode type ☝️: ObjectExpression`.
