---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Improve reload behavior on lazy chunk loading error.

When the module for a lazy chunk 404's, typically caused by a deploy since the
last page load, `lazyRouteComponent` reloads the module to pick up the new
build. To avoid a reload-loop, we store the error message in `sessionStorage`
and don't reload if we've already "used up" the reload for that error.

This approach works very well on Chrome and Firefox, where the error is unique
to the missing module, meaning if another deploy happens during the same
session, we get a new error and can have another reload.

On Safari however, that error message is very plan, just "Importing a module
script failed." So any chunk loading error causes future deploys to throw
without a reload for that session because the errors are not unique per failed
module.

The solution I chose is to clear the error on a successful recovery. This still
prevents the reload loop, because if we don't recover successfully, the key is
still there and we won't reload. But it means that in Safari, the error is
cleared, and we can reload on the next chunk error in the same session.

My original strategy was to key not by the error message but by the import name,
but this has an edge case that could show up with certain bundlers. Namely, if
import names are deterministic, an import could 404, trigger a reload, then 404
again on a future deploy in the same session. The `lazyRouteComponent` would
view that as a reload loop and throw the 404. In my research, this could happen
with certain configurations of webpack.

I verified my approach by first reproducing the error in Safari, and then I
tried with the fix. Also tested in Chrome to ensure the approach works there.
