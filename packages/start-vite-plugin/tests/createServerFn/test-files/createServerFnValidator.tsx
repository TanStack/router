import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

export const withUseServer = createServerFn({
  method: 'GET',
  serverValidator: z.number(),
  fn: (num) => num + 1,
})
