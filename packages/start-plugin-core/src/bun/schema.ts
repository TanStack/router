import { z } from 'zod'
import {
  parseStartConfig as parseCoreStartConfig,
  tanstackStartOptionsObjectSchema,
} from '../schema'
import type { CompileStartFrameworkOptions } from '../types'
import type { InlineCssInputOptions } from '../schema'
import type { BunCssOptions, BunCoreOptions } from './types'

export const tanstackStartBunOptionsSchema = tanstackStartOptionsObjectSchema
  .extend({
    bun: z
      .object({
        clientOutDir: z.string().optional(),
        serverOutDir: z.string().optional(),
        publicBase: z.string().optional(),
        port: z.number().int().positive().optional(),
        hostname: z.string().optional(),
        // Plugins / css.transform are runtime-only; keep schema permissive
        plugins: z.array(z.any()).optional(),
        clientPlugins: z.array(z.any()).optional(),
        serverPlugins: z.array(z.any()).optional(),
        css: z
          .object({
            tailwind: z.union([z.boolean(), z.literal('auto')]).optional(),
            transform: z.any().optional(),
            content: z.array(z.string()).optional(),
          })
          .optional(),
        nitro: z
          .union([
            z.literal(false),
            z.object({
              preset: z.string().optional(),
              config: z.record(z.string(), z.any()).optional(),
            }),
          ])
          .optional(),
        standalone: z
          .union([
            z.literal(false),
            z.object({
              outfile: z.string().optional(),
              target: z.string().optional(),
              compile: z.record(z.string(), z.any()).optional(),
            }),
          ])
          .optional(),
      })
      .optional(),
  })
  .optional()
  .prefault({})

export function parseStartConfig(
  opts: z.input<typeof tanstackStartBunOptionsSchema>,
  corePluginOpts: { framework: CompileStartFrameworkOptions },
  root: string,
) {
  tanstackStartBunOptionsSchema.parse(opts)
  const { bun: _bun, ...coreOptions } = opts ?? {}
  return parseCoreStartConfig(coreOptions, corePluginOpts, root)
}

export type TanStackStartBunInputConfig = z.input<
  typeof tanstackStartBunOptionsSchema
> & {
  bun?: BunCoreOptions & {
    css?: BunCssOptions
  }
  server?: {
    build?: {
      inlineCss?: InlineCssInputOptions
    }
  }
}
