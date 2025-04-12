
import z from 'zod'

export const Route = createFileRoute({
  validateSearch: z.object({
    preload: z.literal(false).optional(),
  }),
})
