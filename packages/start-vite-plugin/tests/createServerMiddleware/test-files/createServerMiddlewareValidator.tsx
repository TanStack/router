import { createServerMiddleware } from '@tanstack/start'
import { z } from 'zod'

export const withUseServer = createServerMiddleware({
  id: 'test',
})
  .input(z.number())
  .use(({ payload }) => payload + 1)
