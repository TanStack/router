import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

export const withUseServer = createServerFn({
  method: 'GET',
})
  .input(z.number())
  .handler(({ input }) => input + 1)
