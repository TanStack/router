import { z } from 'zod'
import {
  parseStartConfig as parseCoreStartConfig,
  tanstackStartOptionsObjectSchema,
} from '../schema'
import type { CompileStartFrameworkOptions } from '../types'

export const tanstackStartRsbuildOptionsSchema =
  tanstackStartOptionsObjectSchema
    .extend({
      rsbuild: z
        .object({ installDevServerMiddleware: z.boolean().optional() })
        .optional(),
    })
    .optional()
    .default({})

export function parseStartConfig(
  opts: z.input<typeof tanstackStartRsbuildOptionsSchema>,
  corePluginOpts: { framework: CompileStartFrameworkOptions },
  root: string,
) {
  const { rsbuild: _rsbuild, ...coreOptions } =
    tanstackStartRsbuildOptionsSchema.parse(opts)

  return parseCoreStartConfig(coreOptions, corePluginOpts, root)
}

export type TanStackStartRsbuildInputConfig = z.input<
  typeof tanstackStartRsbuildOptionsSchema
>
