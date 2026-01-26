---
name: Client entry point
description: Client entry customization for Start apps.
version: 1
source: docs/start/framework/react/guide/client-entry-point.md
---

# Client entry point

## Summary

- Optional client entry can wrap `StartClient` and customize hydration.
- Use `hydrateRoot` and custom error boundaries if needed.
- Defaults are provided if no entry is defined.

## Use cases

- Wrap app in custom providers
- Add global error boundaries on the client
- Toggle dev-only tooling

## Notes

- Use `hydrateRoot` for client hydration.
- `StartClient` handles client-side router setup.

## Examples

```tsx
import { StartClient } from '@tanstack/start/client'
import { hydrateRoot } from 'react-dom/client'

hydrateRoot(document, <StartClient />)
```
