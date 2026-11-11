---
'@tanstack/router-plugin': patch
---

Route code splitting of an option value written as a parenthesized sequence (`component: (track('x'), () => <p />)`) produced a split chunk that did not parse; the chunk now evaluates the whole value, in order, when it loads.
