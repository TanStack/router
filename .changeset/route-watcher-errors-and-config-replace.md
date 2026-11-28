---
'@tanstack/router-cli': patch
'@tanstack/router-generator': patch
---

The route generator's file watcher and the `tsr watch` config watcher report their errors instead of ending the process. An example is a path the watcher cannot watch, such as a route file linked to a file in a directory that can be searched but not read. The watcher keeps watching the other paths.

`tsr watch` now starts again with the new config when `tsr.config.json` is replaced by a save that removes the file and writes it again, and when the file is created after `tsr watch` started. Before, it could keep the previous config until it was restarted. A config saved while `tsr watch` is starting again makes one more start after it, so starts no longer overlap.
