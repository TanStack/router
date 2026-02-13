import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod/v4'

export const withUseServer = createServerFn({
  method: 'GET',
})
  .inputValidator(z.number())
  .handler(({ input }) => input + 1)
