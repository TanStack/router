---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Dev HMR: a route file that stops parsing keeps its last facts, so its importers (the route tree) no longer hot-update into a full reload onto the dev server's error page; a dependent whose compiled output did not change is not hot-propagated (a route file gaining an export no longer reloads the page); derived modules a file no longer produces (an extracted export after the export went, a split chunk after `codeSplitGroupings: []`) are dropped from the file's hot update instead of dead-ending into a reload; and a React route component moved between its chunk, the route module and its extracted-export module is swapped in (its React Refresh family changed) instead of kept stale.
