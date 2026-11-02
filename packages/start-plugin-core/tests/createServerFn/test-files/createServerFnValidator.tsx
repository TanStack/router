import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

export const withUseServer = createServerFn({
  method: 'GET',
})
  .validator(z.number())
  .handler(({ input }) => input + 1)
