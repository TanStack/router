import { z } from 'zod'

export const ServerRoute = createServerFileRoute()
  .validator(z.number())
  .middleware(({ input }) => input + 1)
  .methods({
    GET: async ({ input }) => {
      return input + 1
    },
  })
