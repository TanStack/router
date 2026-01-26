---
name: Code splitting
description: Lazy routes and split component files.
version: 1
source: docs/router/framework/react/guide/code-splitting.md
---

# Code splitting

## Summary

- Use `createLazyFileRoute` for file-based lazy routes.
- Use `createLazyRoute` for code-based splitting.
- Root route cannot be split.

## Use cases

- Reduce initial bundle size
- Load heavy routes on demand
- Split admin or settings areas

## Notes

- `createLazyFileRoute` works with `.lazy.tsx` files.
- Avoid splitting loader logic unless necessary.

## Examples

```tsx
// src/routes/settings.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/settings')({
  component: SettingsPage,
})
```
