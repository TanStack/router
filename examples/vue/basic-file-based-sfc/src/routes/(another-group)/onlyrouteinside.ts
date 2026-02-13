import { createFileRoute } from '@tanstack/vue-router'
import { z } from 'zod/v4'
import { zodValidator } from '@tanstack/zod-adapter'

export const Route = createFileRoute('/(another-group)/onlyrouteinside')({
  validateSearch: zodValidator(z.object({ hello: z.string().optional() })),
})
