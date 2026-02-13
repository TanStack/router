import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod/v4'

export const withUseServer = createMiddleware({
  id: 'test',
})
  .inputValidator(z.number())
  .server(({ input }) => input + 1)
