import { z } from 'zod'
import { zodValidator } from '@tanstack/zod-adapter'

export const Route = createFileRoute({
  validateSearch: zodValidator(z.object({ hello: z.string().optional() })),
})
