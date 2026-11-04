---
'@tanstack/router-core': patch
---

Publish fewer router store updates during a navigation. Every synchronous frame between two `beforeLoad` awaits now publishes once, so ending one `beforeLoad` and starting the next hook or the loaders no longer produces separate `isFetching` updates. Loader starts for a whole lane publish together, and a superseding navigation clears the previous lane's fetching state in the same update that publishes its new location. `waitFor` no longer registers an abort listener for plain values.
