---
'@tanstack/router-utils': patch
---

A binding only split code uses that stays because a statement changing a binding the route module keeps uses it (`table.add(d)`, `table.link(d)`, `a.v = k.v = 1`) no longer gets "run that statement in the code that needs it" when code the route module keeps uses that binding (`beforeLoad: () => table.size`): moved or deleted, the statement would change what that code sees, and the warning now says so, naming that code's line. An unused declaration making such a change (`const n = table.add(d).size`) is reported the same way: it was silent with a known method, and asked to delete it with an unknown one.
