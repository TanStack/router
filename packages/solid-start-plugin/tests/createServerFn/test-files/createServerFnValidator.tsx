import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'

export const withUseServer = createServerFn({
  method: 'GET',
})
  .validator(z.number())
  .handler(({ input }) => input + 1)
