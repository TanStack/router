---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting treats a write of pure values to a module binding (`Page.displayName = 'Page'`, `plugins.push(a)`, a link on a server function or middleware builder held in a `const`) as a write of that binding, ordered against the code that reads it, instead of as a side effect ordered against every other one. An exported server function built on a builder in a `const` (`const base = createServerFn(); export const fn = base.handler(…)`) is now extracted and split like the inline chain, without its `eager-export:effects`, `eager-split:order` or `eager-split:needers` warnings. A component with such a write (`Inner.displayName = 'X'`) moves with the split code that needs it even when an unknown call follows it, an augmented export is extracted whatever effects precede it, and a component two split options need goes to a shared split module instead of staying in the route module.
