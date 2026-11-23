---
'@tanstack/solid-start': patch
---

Stop importing `@tanstack/start-server-core/request-scope`, which no published `@tanstack/start-server-core` exports. The server-function handler now uses `createServerEntry` and `handleStartError` from `@tanstack/start-server-core/request-response`.
