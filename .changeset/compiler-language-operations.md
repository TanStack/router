---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting no longer keeps a top-level declaration in the route module because its value comes from operations the language defines: a member read, a spread, `in`/`instanceof`, a call or `new` of a standard global (`Object.entries(…)`, `new Set(…)`, `Math.max(…)`, `JSON.stringify(…)`, `new Intl.NumberFormat(…)`) or a method of the value one returns (`Object.entries(LABELS).map(([value, label]) => ({ value, label }))`). It moves with the split code that reads it; a read through another name, also inside a conditional, `??`/`||`/`&&` or a literal read back (`(alias ?? {}).b`, `[alias][0].b`), is ordered against a later write of the object. Such a declaration is still never deleted when nothing reads it (`JSON.parse(text)` and `new URL(x)` may throw), and an exported one moved to its own module does not mark that module side-effect free. Getters, proxies and iterators are not taken to run code, as for reads.
