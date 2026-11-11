---
'@tanstack/start-plugin-core': patch
---

`vite build --watch`: a rebuild's server bundle now lists the chunks of the client's last build. The server read the start manifest while the client was still rebuilding, so its documents loaded the previous build's client files. The server now waits for the client build that is running, and a server build that embedded another client build than the client's last one (the two watchers report a file at their own times: a fix saved while the client still builds) is built again: the client's build rewrites a small file in Vite's cache directory (`tanstack-start/client-build`) that the server's watcher watches. An edit only the client bundles rebuilds the server only when the client's files or the server functions it calls changed.
