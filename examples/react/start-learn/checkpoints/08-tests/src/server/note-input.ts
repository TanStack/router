import { z } from 'zod'

export const noteInput = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
  category: z.string().trim().min(1).max(40),
})
