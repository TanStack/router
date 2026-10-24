import { createFileRoute } from '@tanstack/vue-router'
import * as z from 'zod'

export const Route = createFileRoute('/(another-group)/onlyrouteinside')({
  validateSearch: z.object({ hello: z.string().optional() }),
})
