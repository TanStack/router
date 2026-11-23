---
'@tanstack/solid-router': patch
---

Stop `<Link>` from logging Solid's `STRICT_READ_UNTRACKED` dev warning when its options are spread from a reactive expression such as a `<For>` item (`<Link {...item.linkOptions}>`). `Link` read `_asChild` in its component body and `ref` in its ref callback; both are now read with `untrack`.
