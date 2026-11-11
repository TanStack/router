---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting keeps a route option value in place (`not-split:ordered-effect`, naming the binding) when it assigns a module binding when the module loads (`component: memo((n = 1, Page))`), or writes a member of an imported object (`registry.page = 1`), and other code reads it at load: the split delayed the write. A value or a declaration passing a function to a call that writes module state (`wrap(function Page() { seen.n = 1 })`) is judged as when the function is named (`wrap(Page)`): the call may run it. A declaration writing a member of a binding inside a region a planner registered stays with that binding.
