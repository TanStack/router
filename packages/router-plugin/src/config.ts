import { z } from 'zod'
import { configSchema as generatorConfigSchema } from '@tanstack/router-generator'

const configSchema = generatorConfigSchema.extend({
  enableRouteGeneration: z.boolean().optional(),
  experimental: z
    .object({
      enableCodeSplitting: z.boolean().optional(),
    })
    .optional(),
})

export type PluginOptions = z.infer<typeof configSchema>
