---
'@tanstack/router-generator': minor
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route-set changes reach every dev server.

- Start on Rsbuild reloads the open tab when the client's route tree changes (a route added, deleted or renamed, a page turned into a server handler or back, a lazy file added), once the client and the server both serve the change. In an app that installed Start, this replaces the reload Rsbuild's client made at the client's compile, with an `HMR update failed` line in the console. With RSC the reload goes over the RSC client's channel. An app that sets `dev.liveReload: false`, for all environments or for the client, is not reloaded; with `dev.hmr: false`, without RSC and with live reload on, Rsbuild's own reload at every client compile stays the only one.
- On Vite dev, the modules of the files a generator run replaced are invalidated when the run is published, so a route tree whose watcher event Vite dropped or another plugin held is not served stale.
- The client's route tree orders each sibling list after leaving out server-only routes: a pathless layout whose only route below it is server-only no longer takes `/` from the index route. The client's tree is also found when `generatedRouteTree` is in a linked directory, one the generator creates included.
- A generator replaced by a `tsr.config.json` change no longer writes, publishes or reports anything for its last run. A cold generation failure followed by another reports the second. A generator session closed before its watcher is ready ends its `watch()`, and a Start `vite build --watch` whose client watcher closes during its first build ends.
- The generator exports `contentDigest` and `ownersLast`, and answers `sourceDigest`, `treeDigest` and `retire()`.
