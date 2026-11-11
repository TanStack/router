---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting no longer keeps a top-level declaration in the route module because its value comes from operations the language defines: a member read, a spread, `in`/`instanceof`, a call or `new` of a standard global (`Object.entries(…)`, `new Set(…)`, `Math.max(…)`, `JSON.stringify(…)`, `new Intl.NumberFormat(…)`) or a method of the value one returns (`Object.entries(LABELS).map(([value, label]) => ({ value, label }))`). It moves with the split code that reads it. Getters, proxies and iterators are not taken to run code, as for reads.
