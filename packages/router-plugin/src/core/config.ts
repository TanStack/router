import { z } from 'zod'
import {
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'
import type { SplitRouteIdentNodes } from './constants'

type SplitBehaviour = Array<Array<SplitRouteIdentNodes>>

const _defaultCodeSplitBehaviour: SplitBehaviour = [['component']]

export type CodeSplittingOptions = {
  /**
   *
   * @default [["component"]]
   */
  defaultBehaviour?: SplitBehaviour
}

const codeSplittingOptionsSchema = z.object({
  defaultBehaviour: z.array(z.string()).optional(),
})

export const configSchema = generatorConfigSchema.extend({
  enableRouteGeneration: z.boolean().optional(),
  codeSplittingOptions: z.custom<CodeSplittingOptions>(
    codeSplittingOptionsSchema.parse,
  ),
})

export const getConfig = (inlineConfig: Partial<Config>, root: string) => {
  const config = getGeneratorConfig(inlineConfig, root)

  return configSchema.parse({ ...config, ...inlineConfig })
}

export type Config = z.infer<typeof configSchema>
