import path from 'node:path'
import { z } from 'zod'
import { configSchema, getConfig } from '@tanstack/router-plugin'
import type { TanStackStartVitePluginCoreOptions } from './plugin'

const tsrConfig = configSchema
  .omit({ autoCodeSplitting: true, target: true, verboseFileRoutes: true })
  .partial()

export function parseStartConfig(
  opts: z.input<typeof tanstackStartOptionsSchema>,
  corePluginOpts: TanStackStartVitePluginCoreOptions,
  root: string,
) {
  const options = tanstackStartOptionsSchema.parse(opts)

  const srcDirectory = options.srcDirectory

  const routesDirectory = path.resolve(
    root,
    srcDirectory,
    options.router.routesDirectory ?? 'routes',
  )

  const generatedRouteTree = path.resolve(
    root,
    srcDirectory,
    options.router.generatedRouteTree ?? 'routeTree.gen.ts',
  )

  return {
    ...options,
    router: {
      ...options.router,
      ...getConfig(
        {
          ...options.router,
          routesDirectory,
          generatedRouteTree,
        },
        root,
      ),
      target: corePluginOpts.framework,
    },
  }
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
  headers: z.record(z.string(), z.string()).optional(),
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

const pageSchema = pageBaseSchema.extend({
  prerender: pagePrerenderOptionsSchema.optional(),
})

const tanstackStartOptionsSchema = z
  .object({
    srcDirectory: z.string().optional().default('src'),
    start: z
      .object({
        entry: z.string().optional(),
      })
      .optional()
      .default({}),
    router: z
      .object({
        entry: z.string().optional(),
        basepath: z.string().optional(),
      })
      .and(tsrConfig.optional().default({}))
      .optional()
      .default({}),
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
        generateFunctionId: z
          .function()
          .args(
            z.object({
              filename: z.string(),
              functionName: z.string(),
            }),
          )
          .returns(z.string().optional())
          .optional(),
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
        autoStaticPathsDiscovery: z.boolean().optional(),
        maxRedirects: z.number().min(0).optional(),
      })
      .and(pagePrerenderOptionsSchema.optional())
      .optional(),
    spa: spaSchema.optional(),
    vite: z
      .object({ installDevServerMiddleware: z.boolean().optional() })
      .optional(),
  })
  .optional()
  .default({})

export type Page = z.infer<typeof pageSchema>

export type TanStackStartInputConfig = z.input<
  typeof tanstackStartOptionsSchema
>
export type TanStackStartOutputConfig = ReturnType<typeof parseStartConfig>
