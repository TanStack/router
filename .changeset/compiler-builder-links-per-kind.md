---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting treats a link on a server function builder held in a `const` (`const base = createServerFn().middleware([auth]); const getA = base.handler(…)`) as a read of that builder, since a server function's links copy its options: a server function only split code uses moves with it while another one on the same base stays. A middleware builder's links still count as writes of the builder they are called on, since they assign its options. Two exported server functions on one shared base now stay in the route module with `eager-export:reads` warnings, as other exports sharing an object do.
