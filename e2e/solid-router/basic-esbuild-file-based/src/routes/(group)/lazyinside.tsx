import { createFileRoute } from '@tanstack/solid-router'
import { z } from 'zod/v4'
import { zodValidator } from '@tanstack/zod-adapter'

export const Route = createFileRoute('/(group)/lazyinside')({
  validateSearch: zodValidator(z.object({ hello: z.string().optional() })),
})
