import path from 'node:path'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { configSchema, getConfig } from '@tanstack/router-generator'
import type { NitroConfig } from 'nitropack'
import type { Options as ViteReactOptions } from '@vitejs/plugin-react'

// type HTTPSOptions = {
//   cert?: string
//   key?: string
//   pfx?: string
//   passphrase?: string
//   validityDays?: number
//   domains?: Array<string>
// }

// type ServerOptions = NitroConfig & {
//   https?: boolean | HTTPSOptions
// }

const viteReactSchema = z.custom<ViteReactOptions>()

const sitemapSchema = z.object({
  host: z.string(),
})

const tsrConfig = configSchema.partial().extend({
  srcDirectory: z.string().optional().default('src'),
})

const TanStackStartOptionsSchema = z
  .object({
    root: z.string().optional().default(process.cwd()),
    target: z.custom<NitroConfig['preset']>().optional(),
    react: viteReactSchema.optional(),
    tsr: tsrConfig.optional().default({}),
    client: z
      .object({
        entry: z.string().optional(),
        base: z.string().optional().default('/_build'),
      })
      .optional()
      .default({}),
    server: z
      .object({
        entry: z.string().optional(),
      })
      .optional()
      .default({}),
    serverFns: z
      .object({
        base: z.string().optional().default('/_server'),
      })
      .optional()
      .default({}),
    public: z
      .object({
        dir: z.string().optional().default('public'),
        base: z.string().optional().default('/'),
      })
      .optional()
      .default({}),
    sitemap: sitemapSchema.optional(),
    prerender: z
      .object({
        enabled: z.boolean().optional(),
        routes: z.array(z.string()).optional(),
      })
      .optional()
      .default({}),
  })
  .optional()
  .default({})

export function getTanStackStartOptions(opts?: TanStackStartInputConfig) {
  const options = TanStackStartOptionsSchema.parse(opts)

  const srcDirectory = options.tsr.srcDirectory

  const routesDirectory =
    options.tsr.routesDirectory ?? path.join(srcDirectory, 'routes')

  const generatedRouteTree =
    options.tsr.generatedRouteTree ??
    path.join(srcDirectory, 'routeTree.gen.ts')

  const clientEntryPath = (() => {
    if (options.client.entry) {
      return path.join(srcDirectory, options.client.entry)
    }

    if (existsSync(path.join(srcDirectory, 'client.tsx'))) {
      return path.join(srcDirectory, 'client.tsx')
    }

    return '/~start/default-client-entry'
  })()

  const serverEntryPath = (() => {
    if (options.server.entry) {
      return path.join(srcDirectory, options.server.entry)
    }

    if (existsSync(path.join(srcDirectory, 'server.tsx'))) {
      return path.join(srcDirectory, 'server.tsx')
    }

    return '/~start/default-server-entry'
  })()

  return {
    ...options,
    tsr: {
      ...options.tsr,
      ...getConfig({
        ...options.tsr,
        routesDirectory,
        generatedRouteTree,
      }),
    },
    clientEntryPath,
    serverEntryPath,
  }
}

export type TanStackStartInputConfig = z.input<
  typeof TanStackStartOptionsSchema
>
export type TanStackStartOutputConfig = ReturnType<
  typeof getTanStackStartOptions
>
