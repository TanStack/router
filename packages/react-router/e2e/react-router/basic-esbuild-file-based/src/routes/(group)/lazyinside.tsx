import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { zodValidator } from '@tanstack/zod-adapter'

export const Route = createFileRoute('/(group)/lazyinside')({
  validateSearch: zodValidator(z.object({ hello: z.string().optional() })),
})
