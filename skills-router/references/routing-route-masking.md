---
name: Route masking
description: Masked URLs and unmasking behavior.
version: 1
source: docs/router/framework/react/guide/route-masking.md
---

# Route masking

## Summary

- Mask actual URLs while navigating to different routes.
- Use `mask` on `<Link>` or `navigate`, or define `routeMasks`.
- Control unmasking with `unmaskOnReload`.

## Use cases

- Keep URLs stable while showing contextual UI
- Hide internal routes behind friendly URLs
- Mask modal or drawer routes

## Notes

- Masked URLs are stored in `location.state.__tempLocation`.
- Masking is not preserved when sharing a URL.

## Examples

```tsx
<Link
  to="/photos/$photoId"
  params={{ photoId: '123' }}
  mask={{ to: '/photos' }}
>
  Open photo
</Link>
```
