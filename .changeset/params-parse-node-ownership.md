---
'@tanstack/router-core': patch
---

Keep `params.parse` and `params.priority` scoped to the route that declares them during matching. A pathless layout (with or without its own `params.parse`) no longer replaces its parent's parser, a route ending on a static segment no longer applies its parser to sibling routes that share that segment, and an index route with `params.parse` is no longer shadowed by a same-shape index route without one. Pathless layouts and same-shape routes with `params.parse` are now tried in `params.priority` order.
