import path from 'node:path'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { configSchema, getConfig } from '@tanstack/router-generator'
import type { NitroConfig } from 'nitropack'

const tsrConfig = configSchema
  .omit({ autoCodeSplitting: true })
  .partial()
  .extend({
    srcDirectory: z.string().optional().default('src'),
  })

export function createTanStackConfig<
  TFrameworkPlugin extends Record<string, unknown>,
>(frameworkPlugin?: TFrameworkPlugin) {
  const schema = createTanStackStartOptionsSchema(frameworkPlugin)

  return {
    schema,
    parse: (opts?: z.input<typeof schema>) => {
      const options = schema.parse(opts)

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

        if (existsSync(path.join(srcDirectory, 'server.ts'))) {
          return path.join(srcDirectory, 'server.ts')
        }

        if (existsSync(path.join(srcDirectory, 'server.js'))) {
          return path.join(srcDirectory, 'server.js')
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
    },
  }
}

export function createTanStackStartOptionsSchema(
  frameworkPlugin: Record<string, unknown> = {},
) {
  return z
    .object({
      root: z.string().optional().default(process.cwd()),
      target: z.custom<NitroConfig['preset']>().optional(),
      ...frameworkPlugin,
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
          base: z.string().optional().default('/_serverFn'),
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
      pages: z.array(pageSchema).optional().default([]),
      sitemap: z
        .object({
          enabled: z.boolean().optional().default(true),
          host: z.string().optional(),
          outputPath: z.string().optional().default('sitemap.xml'),
        })
        .optional(),
      prerender: z
        .object({
          enabled: z.boolean().optional(),
          concurrency: z.number().optional(),
          filter: z.function().args(pageSchema).returns(z.any()).optional(),
          failOnError: z.boolean().optional(),
        })
        .and(pagePrerenderOptionsSchema.optional())
        .optional(),
      spa: spaSchema.optional(),
    })
    .optional()
    .default({})
}

const pageSitemapOptionsSchema = z.object({
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

const pageBaseSchema = z.object({
  path: z.string(),
  sitemap: pageSitemapOptionsSchema.optional(),
  fromCrawl: z.boolean().optional(),
})

const pagePrerenderOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  outputPath: z.string().optional(),
  autoSubfolderIndex: z.boolean().optional(),
  crawlLinks: z.boolean().optional(),
  retryCount: z.number().optional(),
  retryDelay: z.number().optional(),
  onSuccess: z
    .function()
    .args(
      z.object({
        page: pageBaseSchema,
        html: z.string(),
      }),
    )
    .returns(z.any())
    .optional(),
})

const spaSchema = z.object({
  enabled: z.boolean().optional().default(true),
  maskPath: z.string().optional().default('/'),
  prerender: pagePrerenderOptionsSchema
    .optional()
    .default({})
    .transform((opts) => ({
      outputPath: opts.outputPath ?? '/_shell',
      crawlLinks: false,
      retryCount: 0,
      ...opts,
      enabled: true,
    })),
})

export const pageSchema = pageBaseSchema.extend({
  prerender: pagePrerenderOptionsSchema.optional(),
})

export type Page = z.infer<typeof pageSchema>
