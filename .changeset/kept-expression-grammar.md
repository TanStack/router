---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

A function an env-only or isomorphic fn keeps in place of its call now behaves as the call did wherever the call stood:

- an optional chain the call site continues still throws on a failed read (`createServerOnlyFn(cfg?.impl).name` read `undefined`), and an assignment through one builds;
- a nested call (`createServerOnlyFn(createIsomorphicFn().server({}))` as an arrow's body, `createServerOnlyFn(createServerOnlyFn(function () {}))` as a statement) builds and returns its value;
- a kept string statement (`createServerOnlyFn('use client')` after the factory's import) never becomes a directive once the import is removed, nor once a lowering erases TypeScript wrappers around it or the parentheses with them (`createServerOnlyFn('use strict' as any)` in a function with a default parameter failed the Rsbuild build; TypeScript's transpiler and esbuild made a directive of the parenthesised string);
- the kept text no longer runs into the next token (`createServerOnlyFn(impl)in o` failed the build);
- a number before `.` and JSX as a callee or member object get the parentheses they need;
- `delete` and `typeof` of a kept reference act on a value, as on the call's: `delete createServerOnlyFn(box.m)` no longer deletes `box.m`;
- in Solid's `<Hydrate>` children, `createClientOnlyFn(cb)()` of a captured `cb` no longer calls it with the component's props as `this`.
