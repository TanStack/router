import { createFileRoute } from '@tanstack/solid-router'
import * as z from 'zod'

export const Route = createFileRoute('/(group)/lazyinside')({
  validateSearch: z.object({ hello: z.string().optional() }),
})
