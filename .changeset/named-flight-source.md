---
'@tanstack/solid-start': patch
---

Adopt Solid's multi-source single-flight protocol: the router's flight data (loader/match state, dehydrated data) now registers under its own source id (`tsr`) when the installed `@solidjs/web` supports named sources, so other caches' slices — e.g. solid-query's `sq` — coexist on the same mutation response instead of competing for the single unnamed consumer slot, and a user-supplied `collectFlightData` hook adds data alongside the router's rather than displacing it. Both halves feature-detect the same installed package and fall back to the previous unnamed-slot behavior on `@solidjs/web` 2.0.0-rc.4 and older.
