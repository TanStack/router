import { z } from 'zod'
import {
  parseStartConfig as parseCoreStartConfig,
  tanstackStartOptionsObjectSchema,
} from '../schema'
import type { CompileStartFrameworkOptions } from '../types'
import type { InlineCssInputOptions } from '../schema'

export const tanstackStartRsbuildOptionsSchema =
  tanstackStartOptionsObjectSchema
    .extend({
      rsbuild: z
        .object({ installDevServerMiddleware: z.boolean().optional() })
        .optional(),
    })
    .optional()
    .prefault({})

export function parseStartConfig(
  opts: z.input<typeof tanstackStartRsbuildOptionsSchema>,
  corePluginOpts: { framework: CompileStartFrameworkOptions },
  root: string,
) {
  tanstackStartRsbuildOptionsSchema.parse(opts)
  const { rsbuild: _rsbuild, ...coreOptions } = opts ?? {}

  return parseCoreStartConfig(coreOptions, corePluginOpts, root)
}

export type TanStackStartRsbuildInputConfig = z.input<
  typeof tanstackStartRsbuildOptionsSchema
> & {
  server?: {
    build?: {
      inlineCss?: InlineCssInputOptions
    }
  }
}
