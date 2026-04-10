import { z } from 'zod'
import {
  parseStartConfig as parseCoreStartConfig,
  tanstackStartOptionsObjectSchema,
} from '../schema'
import type { CompileStartFrameworkOptions } from '../types'

export const tanstackStartViteOptionsSchema = tanstackStartOptionsObjectSchema
  .extend({
    vite: z
      .object({ installDevServerMiddleware: z.boolean().optional() })
      .optional(),
  })
  .optional()
  .default({})

export function parseStartConfig(
  opts: z.input<typeof tanstackStartViteOptionsSchema>,
  corePluginOpts: { framework: CompileStartFrameworkOptions },
  root: string,
) {
  const { vite: _vite, ...coreOptions } =
    tanstackStartViteOptionsSchema.parse(opts)

  return parseCoreStartConfig(coreOptions, corePluginOpts, root)
}

export type TanStackStartViteInputConfig = z.input<
  typeof tanstackStartViteOptionsSchema
>
