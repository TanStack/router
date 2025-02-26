import path from 'node:path'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { configSchema, getConfig } from '@tanstack/router-generator'
import type { UserConfig } from 'vite'
import type { NitroConfig } from 'nitropack'
import type { Options as ViteReactOptions } from '@vitejs/plugin-react'

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

const viteReactSchema = z.custom<ViteReactOptions>()

const routersSchema = z.object({
  ssr: z
    .object({
      entry: z.string().optional().default('ssr.tsx'),
      // middleware: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional()
    .default({}),
  client: z
    .object({
      entry: z.string().optional().default('client.tsx'),
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
  api: z
    .object({
      base: z.string().optional().default('/api'),
      entry: z.string().optional().default('api.ts'),
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
  // Normally these are `./src/___`, but we're using `./app/___` for Start stuff
  appDirectory: z.string().optional().default('app'),
})

const TanStackStartOptionsSchema = z
  .object({
    root: z.string().optional().default(process.cwd()),
    react: viteReactSchema.optional(),
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

  const appDirectory = options.tsr.appDirectory
  const routesDirectory =
    options.tsr.routesDirectory ?? path.join(appDirectory, 'routes')
  const generatedRouteTree =
    options.tsr.generatedRouteTree ??
    path.join(appDirectory, 'routeTree.gen.ts')
  const clientEntryPath = path.join(appDirectory, options.routers.client.entry)
  const ssrEntryPath = path.join(appDirectory, options.routers.ssr.entry)
  const apiEntryPath = path.join(appDirectory, options.routers.api.entry)
  const globalMiddlewareEntryPath = path.join(
    appDirectory,
    options.routers.server.globalMiddlewareEntry,
  )
  const hasApiEntry = existsSync(apiEntryPath)

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
    ssrEntryPath,
    apiEntryPath,
    globalMiddlewareEntryPath,
    hasApiEntry,
  }
}

export type TanStackStartInputConfig = z.input<
  typeof TanStackStartOptionsSchema
>
export type TanStackStartOutputConfig = ReturnType<
  typeof getTanStackStartOptions
>
