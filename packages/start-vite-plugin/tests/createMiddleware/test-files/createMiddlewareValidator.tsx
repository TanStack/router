import { createMiddleware } from '@tanstack/start'
import { z } from 'zod'

export const withUseServer = createMiddleware({
  id: 'test',
})
  .input(z.number())
  .server(({ input }) => input + 1)
