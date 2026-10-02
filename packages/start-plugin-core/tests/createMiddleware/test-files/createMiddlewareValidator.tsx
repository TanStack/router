import { createMiddleware } from '@tanstack/react-start'
import * as z from 'zod'

export const withUseServer = createMiddleware({
  id: 'test',
})
  .validator(z.number())
  .server(({ input }) => input + 1)
