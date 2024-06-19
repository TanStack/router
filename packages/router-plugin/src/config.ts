import { z } from 'zod'
import {
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'

export const configSchema = generatorConfigSchema.extend({
  enableRouteGeneration: z.boolean().optional(),
  experimental: z
    .object({
      enableCodeSplitting: z.boolean().optional(),
    })
    .optional(),
})

export const getConfig = async (
  inlineConfig: Partial<Config>,
  root: string,
) => {
  const config = await getGeneratorConfig(inlineConfig, root)

  return configSchema.parse({ ...config, ...inlineConfig })
}

export type Config = z.infer<typeof configSchema>
