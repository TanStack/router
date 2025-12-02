import { createFileRoute } from '@tanstack/vue-router'
import { z } from 'zod'
import { zodValidator } from '@tanstack/zod-adapter'

export const Route = createFileRoute('/(group)/inside')({
  validateSearch: zodValidator(z.object({ hello: z.string().optional() })),
})
