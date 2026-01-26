---
name: Navigation
description: Link, navigate, and match utilities.
version: 1
source: docs/router/framework/react/guide/navigation.md
---

# Navigation

## Summary

- Use `<Link>` for user-initiated navigation.
- Use `useNavigate` or `router.navigate` for imperative navigation.
- Use `<Navigate>` for immediate redirects in render.

## Options

- Supports `params`, `search`, `hash`, `state`, `replace`, `resetScroll`, and `reloadDocument`.
- `activeOptions` controls active link detection.
- `viewTransition` can be enabled for navigation transitions.

## Matching utilities

- Use `useMatchRoute` or `<MatchRoute>` to test a route match.

## Use cases

- Navigate between routes with params/search
- Trigger redirects based on state
- Check whether a route is active

## Notes

- Prefer `<Link>` inside UI; use `useNavigate` for effects.
- `search={true}` preserves existing search params.

## Examples

```tsx
<Link to="/users/$userId" params={{ userId: '42' }}>
  View user
</Link>
```

```tsx
const navigate = useNavigate()
navigate({ to: '/search', search: (prev) => ({ ...prev, q: 'router' }) })
```
