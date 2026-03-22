# Scroll Restoration

Manage scroll position during navigation.

## Enable Scroll Restoration

```tsx
const router = createRouter({
  routeTree,
  scrollRestoration: true,
})
```

## Scroll Behavior

```tsx
const router = createRouter({
  routeTree,
  scrollRestoration: true,
  scrollRestorationBehavior: 'smooth', // or 'auto' (instant)
})
```

## Per-Navigation Control

```tsx
// Don't restore scroll for this navigation
navigate({ to: '/posts', resetScroll: false })

// Always reset to top
navigate({ to: '/posts', resetScroll: true })
```

## Hash Navigation

```tsx
// Scroll to element with id="comments"
<Link to="/posts/$postId" params={{ postId: '123' }} hash="comments">
  Jump to Comments
</Link>
```

## Custom Scroll Behavior

```tsx
const router = createRouter({
  routeTree,
  scrollRestoration: true,
  getScrollRestorationKey: (location) => {
    // Use pathname only (ignore search params)
    return location.pathname
  },
})
```

## Scroll to Top on Route Change

```tsx
// In root route component
function RootComponent() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return <Outlet />
}
```

## Scroll Position Storage

Router stores scroll positions in session storage by default.

```tsx
const router = createRouter({
  routeTree,
  scrollRestoration: {
    // Custom storage
    getKey: (location) => location.pathname,
    storage: {
      get: (key) => sessionStorage.getItem(`scroll:${key}`),
      set: (key, value) => sessionStorage.setItem(`scroll:${key}`, value),
    },
  },
})
```

## Disable for Specific Routes

```tsx
export const Route = createFileRoute('/infinite-scroll')({
  // Don't restore scroll on this route
  meta: () => [{ scrollRestoration: false }],
})
```
