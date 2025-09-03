import { z } from 'zod'
import {
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'
import type { RegisteredRouter, RouteIds } from '@tanstack/router-core'
import type { CodeSplitGroupings } from './constants'

export const splitGroupingsSchema = z
  .array(
    z.array(
      z.union([
        z.literal('loader'),
        z.literal('component'),
        z.literal('pendingComponent'),
        z.literal('errorComponent'),
        z.literal('notFoundComponent'),
      ]),
    ),
    {
      message:
        "  Must be an Array of Arrays containing the split groupings. i.e. [['component'], ['pendingComponent'], ['errorComponent', 'notFoundComponent']]",
    },
  )
  .superRefine((val, ctx) => {
    const flattened = val.flat()
    const unique = [...new Set(flattened)]

    // Elements must be unique,
    // ie. this shouldn't be allows [['component'], ['component', 'loader']]
    if (unique.length !== flattened.length) {
      ctx.addIssue({
        code: 'custom',
        message:
          "  Split groupings must be unique and not repeated. i.e. i.e. [['component'], ['pendingComponent'], ['errorComponent', 'notFoundComponent']]." +
          `\n  You input was: ${JSON.stringify(val)}.`,
      })
    }
  })

export type CodeSplittingOptions = {
  /**
   * Use this function to programmatically control the code splitting behavior
   * based on the `routeId` for each route.
   *
   * If you just need to change the default behavior, you can use the `defaultBehavior` option.
   * @param params
   */
  splitBehavior?: (params: {
    routeId: RouteIds<RegisteredRouter['routeTree']>
  }) => CodeSplitGroupings | undefined | void

  /**
   * The default/global configuration to control your code splitting behavior per route.
   * @default [['component'],['pendingComponent'],['errorComponent'],['notFoundComponent']]
   */
  defaultBehavior?: CodeSplitGroupings

  /**
   * The nodes that shall be deleted from the route.
   * @default undefined
   */
  deleteNodes?: Array<DeletableNodes>

  /**
   * @default true
   */
  addHmr?: boolean
}

const DELETABLE_NODES = ['ssr'] as const
export const deletableNodesSchema = z.enum(DELETABLE_NODES)
const codeSplittingOptionsSchema = z.object({
  splitBehavior: z.function().optional(),
  defaultBehavior: splitGroupingsSchema.optional(),
  deleteNodes: z.array(deletableNodesSchema).optional(),
  addHmr: z.boolean().optional().default(true),
})
export type DeletableNodes = (typeof DELETABLE_NODES)[number]

export const configSchema = generatorConfigSchema.extend({
  enableRouteGeneration: z.boolean().optional(),
  codeSplittingOptions: z
    .custom<CodeSplittingOptions>((v) => {
      return codeSplittingOptionsSchema.parse(v)
    })
    .optional(),
  plugin: z
    .object({
      vite: z
        .object({
          environmentName: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
})

export const getConfig = (inlineConfig: Partial<Config>, root: string) => {
  const config = getGeneratorConfig(inlineConfig, root)

  return configSchema.parse({ ...config, ...inlineConfig })
}

export type Config = z.infer<typeof configSchema>
export type ConfigInput = z.input<typeof configSchema>
export type ConfigOutput = z.output<typeof configSchema>
