import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { zodSearchValidator } from '@tanstack/router-zod-adapter'

export const Route = createFileRoute('/(group)/lazyinside')({
  validateSearch: zodSearchValidator(
    z.object({ hello: z.string().optional() }),
  ),
})
