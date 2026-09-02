---
'@tanstack/solid-start': patch
---

Adopt Solid's multi-source single-flight protocol: the router's flight data (loader/match state, dehydrated data) registers under its own source id (`tsr`), so other caches' slices — e.g. solid-query's `sq` — coexist on the same mutation response instead of competing for a single consumer slot, and a user-supplied `collectFlightData` hook adds data alongside the router's rather than displacing it. Requires solid-js / @solidjs/web 2.0.0-rc.6+ (named flight-data sources).
