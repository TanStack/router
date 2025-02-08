import { z } from 'zod'
import {
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'
import type { SplitGroupings } from './constants'

export type CodeSplittingOptions = {
  /**
   *
   * @default [["component"]]
   */
  defaultBehaviour?: SplitGroupings
}

const codeSplittingOptionsSchema = z.object({
  defaultBehaviour: z.array(z.string()).optional(),
})

export const configSchema = generatorConfigSchema.extend({
  enableRouteGeneration: z.boolean().optional(),
  codeSplittingOptions: z
    .custom<CodeSplittingOptions>(codeSplittingOptionsSchema.parse)
    .optional(),
})

export const getConfig = (inlineConfig: Partial<Config>, root: string) => {
  const config = getGeneratorConfig(inlineConfig, root)

  return configSchema.parse({ ...config, ...inlineConfig })
}

export type Config = z.infer<typeof configSchema>
