---
name: Scroll restoration
description: Restore scroll positions on navigation.
version: 1
source: docs/router/framework/react/guide/scroll-restoration.md
---

# Scroll restoration

## Summary

- Enable `scrollRestoration` on the router.
- Configure `scrollToTopSelectors` and restoration key.
- `resetScroll` can disable resets per navigation.

## Use cases

- Preserve scroll on back/forward
- Restore scroll in virtualized lists
- Avoid jump-to-top on internal navigation

## Notes

- Use `getScrollRestorationKey` to customize cache keys.
- `useElementScrollRestoration` supports custom containers.

## Examples

```tsx
const router = createRouter({
  routeTree,
  scrollRestoration: true,
})
```
