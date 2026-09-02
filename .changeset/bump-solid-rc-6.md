---
'@tanstack/solid-router': patch
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-start': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
---

Bump solid-js, @solidjs/web, and @solidjs/signals to ^2.0.0-rc.6 across the monorepo. rc.6 provides the named flight-data source API (registerFlightDataSource / two-argument subscribeFlightData) that the Start single-flight integration now requires; @tanstack/solid-start's peer floor moves to rc.6 accordingly.
