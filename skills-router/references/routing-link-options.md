---
name: Link options helper
description: Reusable, type-safe link option objects.
version: 1
source: docs/router/framework/react/guide/link-options.md
---

# Link options helper

## Summary

- `linkOptions` creates reusable, type-safe option objects.
- Useful for shared route configs and menus.
- Preserves extra fields for UI needs.

## Use cases

- Share consistent link behaviors across menus
- Predefine link options for common routes
- Attach extra metadata to link configs

## Notes

- Works with `<Link>`, `navigate`, and `redirect` options.
- Extra fields remain available for UI labels or icons.

## Examples

```tsx
import { linkOptions, Link } from '@tanstack/react-router'

const usersLink = linkOptions({
  to: '/users',
  preload: 'intent',
  label: 'Users',
})

<Link {...usersLink}>{usersLink.label}</Link>
```
