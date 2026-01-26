---
name: Custom Link
description: Wrap custom anchor components with createLink.
version: 1
source: docs/router/framework/react/guide/custom-link.md
---

# Custom Link

## Summary

- Use `createLink` to wrap UI kit link components.
- Preserves Router link typing and preload options.

## Use cases

- Use Router links with UI libraries
- Centralize link styling while keeping type safety
- Add default preload behavior

## Notes

- Pass your base anchor component to `createLink`.
- Works with UI libraries like MUI, Chakra, or Mantine.

## Examples

```tsx
import { createLink } from '@tanstack/react-router'

const BaseLink = (props: React.ComponentProps<'a'>) => (
  <a {...props} className="btn-link" />
)

export const AppLink = createLink(BaseLink)
```
