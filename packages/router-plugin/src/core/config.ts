import { z } from 'zod'
import {
  configSchema as generatorConfigSchema,
  getConfig as getGeneratorConfig,
} from '@tanstack/router-generator'
import { splitRouteIdentNodes } from './constants'
import type {
  CreateFileRoute,
  RegisteredRouter,
  RouteIds,
} from '@tanstack/router-core'
import type { CodeSplitGroupings } from './constants'

/** What a value given as split groupings must be (`must be …`). */
export const GROUPINGS_SHAPE =
  "an array of groups, each an array of option names (`[['component'], ['errorComponent', 'notFoundComponent']]`)"

/**
 * What is wrong with a value given as split groupings, worded for the user
 * (`… is not an option that can be split …`), or null when it is valid.
 */
export function groupingsProblem(value: unknown): string | null {
  if (!Array.isArray(value) || !value.every((g) => Array.isArray(g))) {
    return `must be ${GROUPINGS_SHAPE}`
  }
  const seen = new Set<unknown>()
  for (const group of value as Array<Array<unknown>>) {
    for (const key of group) {
      if (
        typeof key !== 'string' ||
        !(splitRouteIdentNodes as ReadonlyArray<string>).includes(key)
      ) {
        return `${JSON.stringify(key)} is not an option that can be split (${splitRouteIdentNodes.join(', ')})`
      }
      if (seen.has(key)) {
        return `lists "${key}" twice: each option may be in one group only`
      }
      seen.add(key)
    }
  }
  return null
}

const splitGroupingsSchema = z
  .custom<CodeSplitGroupings>(() => true)
  .superRefine((value, ctx) => {
    const problem = groupingsProblem(value)
    if (problem !== null) {
      ctx.addIssue({ code: 'custom', message: problem })
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
   * @default [['component'],['errorComponent'],['notFoundComponent']]
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

const codeSplittingOptionsSchema = z.object({
  splitBehavior: z
    .custom<
      CodeSplittingOptions['splitBehavior']
    >((value) => typeof value === 'function')
    .optional(),
  defaultBehavior: splitGroupingsSchema.optional(),
  deleteNodes: z.array(z.string()).optional(),
  addHmr: z.boolean().optional().default(true),
})

type FileRouteKeys = keyof (Parameters<
  CreateFileRoute<any, any, any, any, any>
>[0] & {})
export type DeletableNodes = FileRouteKeys | (string & {})

export const configSchema = generatorConfigSchema.extend({
  codeSplittingOptions: z
    .custom<CodeSplittingOptions>(() => true)
    .superRefine((value, ctx) => {
      const res = codeSplittingOptionsSchema.safeParse(value)
      for (const issue of res.success ? [] : res.error.issues) {
        ctx.addIssue({
          code: 'custom',
          message: issue.message,
          path: issue.path,
        })
      }
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

  const res = configSchema.safeParse({ ...inlineConfig, ...config })
  if (!res.success) {
    throw configError(res.error.issues)
  }
  return res.data
}

/**
 * The plugin options' problems as one error naming each option
 * (`codeSplittingOptions.defaultBehavior: "compnent" is not an option that
 * can be split (…)`), its message as its stack: a user error, not ours.
 */
function configError(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Error {
  const lines = issues.map((issue) => {
    const at = issue.path.map(String).join('.')
    return `  ${at === '' ? '' : `${at}: `}${issue.message}`
  })
  const error = new Error(
    `[tanstack-router] Invalid router plugin options:\n${lines.join('\n')}`,
  )
  error.stack = error.message
  return error
}

export type Config = z.infer<typeof configSchema>
export type ConfigInput = z.input<typeof configSchema>
export type ConfigOutput = z.output<typeof configSchema>

/**
 * The options of a code-splitter plugin used alone
 * (`tanStackRouterCodeSplitter`, `TanStackRouterCodeSplitter{Rspack,Webpack}`):
 * it always splits, as it did before `autoCodeSplitting` reached the
 * compiler (`autoCodeSplitting` selects the splitter in `tanstackRouter`).
 */
export function splitterOptions<T>(options: T): T {
  if (typeof options === 'function') {
    const read = options as () => Partial<Config>
    return (() => ({ ...read(), autoCodeSplitting: true })) as T
  }
  return {
    ...(options as Partial<Config> | undefined),
    autoCodeSplitting: true,
  } as T
}
