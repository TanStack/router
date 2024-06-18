import { z } from 'zod'
import {
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'

const configSchema = generatorConfigSchema.extend({
  enableRouteGeneration: z.boolean().optional(),
  experimental: z
    .object({
      enableCodeSplitting: z.boolean().optional(),
    })
    .optional(),
})

export const getConfig = async (
  inlineConfig: Partial<PluginOptions>,
  root: string,
) => {
  const config = await getGeneratorConfig(inlineConfig, root)

  return configSchema.parse({ ...config, ...inlineConfig })
}

export type PluginOptions = z.infer<typeof configSchema>
