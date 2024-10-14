---
id: retainSearchParams
title: Search middleware to retain search params
---

`retainSearchParams` is a search middleware that allows to keep search params.

## retainSearchParams props

The `retainSearchParams` accepts a list of keys of those search params that shall be retained.

## Example

```tsx
import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { zodSearchValidator } from '@tanstack/router-zod-adapter'

const searchSchema = z.object({
  rootValue: z.string().optional(),
})

export const Route = createRootRoute({
  validateSearch: zodSearchValidator(searchSchema),
  search: {
    middlewares: [retainSearchParams(['rootValue'])],
  },
})
```
