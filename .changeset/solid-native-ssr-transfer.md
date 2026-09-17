---
'@tanstack/solid-router': patch
---

Native SSR state transfer for Solid: router match state (loaderData, beforeLoad context, status, errors) now rides Solid's hydration registry under `tsr:` keys instead of a bespoke bootstrap script, deferred `loaderData` promises stream natively via seroval, the client primes router state from the registry in the Router constructor (before any render context, eliminating boot-time refetches and `bootLoad`-style workarounds), and `RouterProvider` owns the server-side `router.load()` dispatch so server entries no longer await it manually.
