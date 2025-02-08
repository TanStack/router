import { z } from 'zod'
import {
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'
import { splitRouteIdentNodes } from './constants'
import type { CodeSplitGroupings } from './constants'

export const splitGroupingsSchema = z
  .array(z.array(z.enum(splitRouteIdentNodes)), {
    message:
      "Must be an Array of Arrays containing the split groupings. i.e. [['component'], ['pendingComponent'], ['errorComponent', 'notFoundComponent']]",
  })
  .superRefine((val, ctx) => {
    const flattened = val.flat()
    const unique = [...new Set(flattened)]

    // Elements must be unique,
    // ie. this shouldn't be allows [['component'], ['component', 'loader']]
    if (unique.length !== flattened.length) {
      ctx.addIssue({
        code: 'custom',
        message:
          "Split groupings must be unique and not repeated. i.e. i.e. [['component'], ['pendingComponent'], ['errorComponent', 'notFoundComponent']]",
      })
    }
  })

export type CodeSplittingOptions = {
  /**
   * Use this function to programmatically control the code splitting behaviour
   * based on the `routeId` for each route.
   *
   * If you just need to change the default behaviour, you can use the `defaultBehaviour` option.
   * @param params
   */
  shouldSplit?: (params: {
    routeId: string
  }) => CodeSplitGroupings | undefined | void

  /**
   * The default/global configuration to control your code splitting behaviour per route.
   * @default [['component'],['pendingComponent'],['errorComponent'],['notFoundComponent']]
   */
  defaultBehaviour?: CodeSplitGroupings
}

const codeSplittingOptionsSchema = z.object({
  shouldSplit: z.function().optional(),
  defaultGroupings: splitGroupingsSchema.optional(),
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
