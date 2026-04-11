---
'@tanstack/start-server-core': patch
---

Publish `start-server-core` with the `pluginAdapters` virtual module added in #7144, fixing a crash in `start-plugin-core@1.167.19` where `VIRTUAL_MODULES.pluginAdapters` is undefined.
