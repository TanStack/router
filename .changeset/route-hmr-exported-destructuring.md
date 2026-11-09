---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

React route HMR: a lowercase route component exported in a destructuring (`export const { component, meta } = makeViews()`) no longer exports the component under the other names of the declaration, and a declaration listing it beside a destructuring (`export const component = …, { a, b } = parts`) no longer fails with a duplicate export. Each export keeps its own binding.
