---
name: Route matching
description: Match ordering and specificity rules.
version: 1
source: docs/router/framework/react/routing/route-matching.md
---

# Route matching

## Summary

- Matching order is based on specificity, not definition order.
- Index routes match first.
- Static routes match next (most specific to least).
- Dynamic routes match next (longest to shortest).
- Splat routes match last.

## Use cases

- Resolve conflicts between static and dynamic routes
- Predict which route will render for a URL
- Design route trees without ambiguity

## Notes

- Specificity is computed from the path structure, not file order.

## Examples

```tsx
// Given these routes, /users/new matches the static route first
createRoute({ path: '/users/new', getParentRoute: () => rootRoute })
createRoute({ path: '/users/$userId', getParentRoute: () => rootRoute })
```
