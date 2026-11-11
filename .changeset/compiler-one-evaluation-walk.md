---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting decides what a declaration runs when the route module loads from what that declaration itself evaluates. A declaration whose load calls a function assigning module state (`const firstId = nextId()` with `const nextId = () => ++seq`) now stays in the route module, with its warning, also when a top-level `if` or `try` assigns that state too; before, it moved to the chunk and the chunk's value differed. A declaration that only holds a function another declaration calls at load (`const api = { getCached }`) is no longer kept in the route module. An option value passing an object with a method to a call (`component: defineComponent({ setup() { … } })`) is split as its `const` spelling is, instead of being kept in place. A value inside a region a planner registered but did not split is read as part of its declaration. An exported server function whose validator the client compile removes is no longer kept in the route module for what the validator reads.
