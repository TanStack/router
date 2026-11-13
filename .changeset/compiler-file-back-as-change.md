---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
---

Dev servers: a file removed and created again within a moment (a stash and pop, a checkout and back) is no longer missed by the modules compiled while it was gone. The watcher may report its return as a change (chokidar folds a removal and a re-creation into one change; Rspack lists a file another environment still had as modified): every file event now asks the imports that did not resolve again (about 30 µs per such import per environment and event; most apps have none: a relative import of a types-only `.d.ts` is one), and a change of a file the compiler knew nothing of counts as its creation. A compile in progress that met such an import goes on unless the event makes it resolve. A file created empty and then saved in place (truncated, then written) has its first save seen: an event that finds a file empty waits for its text unless it repeats an event that already found the file so (the same modification time; a time of whole seconds, as on HFS+, FAT or some network shares, counts as unknown).
