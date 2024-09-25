import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

export const withUseServer = createServerFn({
  method: 'GET',
  serverValidator: z.number(),
  fn: ({ payload }) => payload + 1,
})
