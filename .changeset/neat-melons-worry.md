---
'@tanstack/react-router': patch
---

Fix React Server Component imports from `@tanstack/react-router` by adding a `react-server` root export that preserves the normal API surface while resolving `notFound` and `redirect` from a server-safe entry.

This fixes RSC routes that throw `notFound()` or `redirect()` from server functions so they behave correctly during SSR and client navigation.
