---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Internal: the compiler places every module with one placement, and the analyses only the earlier engine read are gone; compiles are about 5 % faster per module. A `<Hydrate>` boundary inside a top-level statement (`Tabs.Panel = function Panel() { return <Hydrate>… }`, `register('p', () => <Hydrate>…)`) no longer fails the compiler's own output checks in its test runs. A function-level class only erased code reads goes like any other declaration, with the server-only import only it read.
