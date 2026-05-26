---
'@tanstack/react-start': patch
'@tanstack/react-start-client': patch
'@tanstack/solid-start': patch
'@tanstack/solid-start-client': patch
---

Avoid pulling the client hydration entry into root `@tanstack/react-start` and `@tanstack/solid-start` imports by re-exporting `Hydrate` from framework client Hydrate-only subpaths.
