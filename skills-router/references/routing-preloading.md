---
name: Preloading
description: Preload routes on intent, viewport, or render.
version: 1
source: docs/router/framework/react/guide/preloading.md
---

# Preloading

## Summary

- Preload modes: intent, viewport, render.
- Configure defaults via `defaultPreload` and `defaultPreloadDelay`.
- Use `router.preloadRoute` for manual preloads.

## Use cases

- Prefetch route data on hover or intent
- Improve perceived navigation speed
- Preload above-the-fold routes

## Notes

- Default preload cache is short-lived; tune `defaultPreloadMaxAge`.
- Set per-route `preloadStaleTime` for caching behavior.

## Examples

```tsx
<Link to="/dashboard" preload="intent">
  Dashboard
</Link>
```

```tsx
router.preloadRoute({ to: '/settings' })
```
