---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting splits a route option whose call runs a function writing module state that nothing else of the module uses (`component: memo(function Page() { if (!didInit) didInit = true … })`, a member write in an event handler, the named `memo(Page)` spelling); it was kept in the route module with a `not-split:ordered-effect` warning. When other code does use that state, the option still stays, and the warning now says the option writes the binding instead of saying it reads it when the module loads.
