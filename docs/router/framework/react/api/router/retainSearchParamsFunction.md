---
id: retainSearchParams
title: Search middleware to retain search params
---

`retainSearchParams` is a search middleware that allows to keep search params.

## retainSearchParams props

The `retainSearchParams` either accepts `true` or a list of keys of those search params that shall be retained.
If `true` is passed in, all search params will be retained.

## Examples

```tsx
import { z } from 'zod'
import { createRootRoute, retainSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const searchSchema = z.object({
  rootValue: z.string().optional(),
})

export const Route = createRootRoute({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [retainSearchParams(['rootValue'])],
  },
})
```

```tsx
import { z } from 'zod'
import { createFileRoute, retainSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const searchSchema = z.object({
  one: z.string().optional(),
  two: z.string().optional(),
})

export const Route = createFileRoute('/hello')({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [retainSearchParams(true)],
  },
})
```
