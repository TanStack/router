---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting moves two declarations with side effects that only one split option needs, one reading the other when the module loads (TanStack Table's `const columns = [columnHelper.accessor(…)]` after `const columnHelper = createColumnHelper()`, a zod schema extending another), to that option's chunk together, in source order, instead of keeping both in the route module with an `eager-split:reads` warning. They still stay when a side effect written after them stays in the route module. A declaration reading a `const` with side effects that the route module keeps for its own reason now moves too; one reading a `let` the route module keeps still stays.
