import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/redirect/$target')({
  params: {
    parse: z.object({
      target: z.union([z.literal('internal'), z.literal('external')]),
    }).parse,
    stringify: (params) => ({ target: params.target }),
  },
})
