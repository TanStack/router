---
'@tanstack/router-utils': patch
---

The warning about a declaration of several bindings that stays in the route module reads in the plural ("the module changes them outside their declarations", "several split options read them", "move them to their own module", "mark their initialisers … if they have no side effects" when there are several declarations), as does the one about several exports of one binding ("The exports `a`, `b` … stay").
