import { baseConfigSchema } from '@tanstack/router-generator'
import { z } from 'zod'

export const configSchema = baseConfigSchema.extend({
  srcDirectory: z.string().optional().default('src'),
})

export type Config = z.infer<typeof configSchema>
