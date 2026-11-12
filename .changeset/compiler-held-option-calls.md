---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

Route code splitting reads a call whose result is a component or loader option's value as keeping the function it is handed for the router to call later (R152): `component: observer(function Page() { … })`, `withAuth(observer(Page))`, `const P = memo(Page)` with `component: P`, and a name inside an object or array handed to such a call split even when the page reads state the loader writes, as main split them. Every other call may still run what it is handed: a declaration kept for a read only inside such a function (`const save = debounce(() => seen.size)`, a wrapped sub-component used as a JSX tag) is reported as one that _may_ use the binding, with the fix that applies. An extracted export still reads every call as running what it is handed. Planners state these values with `PlanContext.calledLater`.
