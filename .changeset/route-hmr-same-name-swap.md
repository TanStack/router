---
'@tanstack/router-plugin': patch
---

Route HMR shows a component option that an edit points at another component under the same name: switching `import { Shell } from '../layouts/classic'` to `'../layouts/modern'` in an unsplit or root route (React and Solid), or flipping `component: wide ? Wide : Narrow` (React). Such values were kept as if React Refresh or solid-refresh would patch them. In React development, a split component whose value cannot hold the route HMR marker (a frozen object) no longer throws when its chunk loads.
