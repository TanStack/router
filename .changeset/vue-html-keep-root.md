---
'@tanstack/vue-router': patch
---

After hydration, `Html` keeps `Body` as the root vnode and renders the head teleport inside it. Components on the page mount once, and CSS animations no longer start again.
