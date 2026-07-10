---
'@tanstack/router-generator': patch
---

fix(router-generator): keep dotted virtual pathless layout filenames as one segment

`layout('pathless.layout.tsx')` was running the layout id through `determineInitialRoutePath`, which treats unescaped dots as path separators. That turned `_pathless.layout` into `/_pathless/layout` and mounted children under a real `/layout` URL segment. Dots in layout ids are now escaped so the id stays a single pathless segment and children keep their original paths (e.g. `/subpath`).

Fixes #7761.
