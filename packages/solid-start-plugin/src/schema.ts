import path from 'node:path'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { configSchema, getConfig } from '@tanstack/router-generator'
import type { NitroConfig } from 'nitropack'
import type { Options as ViteSolidOptions } from 'vite-plugin-solid'

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

const viteSolidSchema = z.custom<ViteSolidOptions>()

const sitemapPageOptionsSchema = z.object({
  exclude: z.boolean().optional(),
  priority: z.number().min(0).max(1).optional(),
  changefreq: z
    .enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'])
    .optional(),
  lastmod: z.union([z.string(), z.date()]).optional(),
  alternateRefs: z
    .array(
      z.object({
        href: z.string(),
        hreflang: z.string(),
      }),
    )
    .optional(),
  images: z
    .array(
      z.object({
        loc: z.string(),
        caption: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .optional(),
  news: z
    .object({
      publication: z.object({
        name: z.string(),
        language: z.string(),
      }),
      publicationDate: z.union([z.string(), z.date()]),
      title: z.string(),
    })
    .optional(),
})

const tsrConfig = configSchema.partial().extend({
  srcDirectory: z.string().optional().default('src'),
})

const pageSitemapOptionsSchema = z.union([
  z.boolean(),
  sitemapPageOptionsSchema,
])

export const pagePrerenderOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  autoSubfolderIndex: z.boolean().optional(),
  crawlLinks: z.boolean().optional(),
  retryCount: z.number().optional(),
  retryDelay: z.number().optional(),
})

export const pageSchema = z.object({
  path: z.string(),
  prerender: pagePrerenderOptionsSchema.optional(),
  sitemap: pageSitemapOptionsSchema.optional(),
})

export type Page = z.infer<typeof pageSchema>

const TanStackStartOptionsSchema = z
  .object({
    root: z.string().optional().default(process.cwd()),
    target: z.custom<NitroConfig['preset']>().optional(),
    solid: viteSolidSchema.optional(),
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
    pages: z.array(z.union([z.string(), pageSchema])).optional(),
    sitemap: pagePrerenderOptionsSchema.optional().and(
      z
        .object({
          host: z.string().optional(),
        })
        .optional(),
    ),
    prerender: z
      .object({
        enabled: z.boolean().optional(),
        concurrency: z.number().optional(),
        filter: z.function().args(pageSchema).returns(z.any()).optional(),
        failOnError: z.boolean().optional(),
      })
      .and(pagePrerenderOptionsSchema.optional())
      .optional(),
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
