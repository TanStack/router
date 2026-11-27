---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

fix: a disabled `Link` now keeps a `role` set by the caller (e.g. `role="menuitem"`) and only defaults to `role="link"` when none is given; `aria-disabled` is still set
