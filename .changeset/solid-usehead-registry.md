---
'@tanstack/solid-router': patch
---

Register head tags through Solid's `useHead` registry. `HeadContent` now
feeds the route-derived tags to Solid's head registry as one reactive group
instead of rendering elements in-tree: the registry owns head emission on
both runtimes (SSR splicing/streaming and client-side patching), replacing
the manual relocate-into-head, imperative script injection, and
`document.title` syncing. `HeadContent` can now be rendered anywhere in the
tree. The dedicated development entry (`index.dev`) and its `development`
export conditions are retired along with it.
