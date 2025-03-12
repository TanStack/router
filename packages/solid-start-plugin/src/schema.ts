import path from 'node:path'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { configSchema, getConfig } from '@tanstack/router-generator'
import type { UserConfig } from 'vite'
import type { NitroConfig } from 'nitropack'
import type { Options as ViteSolidOptions } from 'vite-plugin-solid'

type HTTPSOptions = {
  cert?: string
  key?: string
  pfx?: string
  passphrase?: string
  validityDays?: number
  domains?: Array<string>
}

type ServerOptions = NitroConfig & {
  https?: boolean | HTTPSOptions
}

export const serverSchema = z.custom<ServerOptions>().and(
  z.object({
    preset: z
      .custom<ServerOptions['preset']>()
      .optional()
      .default('node-server'),
  }),
)

const viteSchema = z.custom<UserConfig>()

const viteSolidSchema = z.custom<ViteSolidOptions>()

const routersSchema = z.object({
  ssr: z
    .object({
      entry: z.string().optional(),
      // middleware: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional()
    .default({}),
  client: z
    .object({
      entry: z.string().optional(),
      base: z.string().optional().default('/_build'),
      vite: viteSchema.optional(),
    })
    .optional()
    .default({}),
  server: z
    .object({
      base: z.string().optional().default('/_server'),
      globalMiddlewareEntry: z
        .string()
        .optional()
        .default('global-middleware.ts'),
      // middleware: z.string().optional(),
      vite: viteSchema.optional(),
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
})

const sitemapSchema = z.object({
  host: z.string(),
})

const tsrConfig = configSchema.partial().extend({
  srcDirectory: z.string().optional().default('src'),
})

const TanStackStartOptionsSchema = z
  .object({
    root: z.string().optional().default(process.cwd()),
    solid: viteSolidSchema.optional(),
    vite: viteSchema.optional(),
    tsr: tsrConfig.optional().default({}),
    routers: routersSchema.optional().default({}),
    server: serverSchema.optional().default({}),
    sitemap: sitemapSchema.optional(),
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
    if (options.routers.client.entry) {
      return path.join(srcDirectory, options.routers.client.entry)
    }

    if (existsSync(path.join(srcDirectory, 'client.tsx'))) {
      return path.join(srcDirectory, 'client.tsx')
    }

    return '/~start/default-client-entry'
  })()

  const serverEntryPath = (() => {
    if (options.routers.ssr.entry) {
      return path.join(srcDirectory, options.routers.ssr.entry)
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
