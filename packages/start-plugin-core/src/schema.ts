import path from 'node:path'
import { z } from 'zod/v4'
import { configSchema, getConfig } from '@tanstack/router-plugin'
import type { TanStackStartVitePluginCoreOptions } from './types'

const tsrConfig = configSchema
  .omit({ autoCodeSplitting: true, target: true, verboseFileRoutes: true })
  .extend({
    // Override path fields to override their defaults (e.g. './src/routes').
    // parseStartConfig resolves these relative to srcDirectory, so the
    // generator-level defaults would cause a doubled 'src/src/routes' path.
    routesDirectory: z.string().optional().prefault('routes'),
    generatedRouteTree: z.string().optional().prefault('routeTree.gen.ts'),
  })
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
    .function({
      input: z.tuple([
        z.object({
          page: pageBaseSchema,
          html: z.string(),
        })
      ]),
      output: z.any(),
    })
    .optional(),
  headers: z.record(z.string(), z.string()).optional(),
})

const spaSchema = z.object({
  enabled: z.boolean().optional().prefault(true),
  maskPath: z.string().optional().prefault('/'),
  prerender: pagePrerenderOptionsSchema
    .optional()
    .prefault({})
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
    srcDirectory: z.string().optional().prefault('src'),
    start: z
      .object({
        entry: z.string().optional(),
      })
      .optional()
      .prefault({}),
    router: z
      .object({
        entry: z.string().optional(),
        basepath: z.string().optional(),
      })
      .and(tsrConfig.optional().prefault({}))
      .optional()
      .prefault({}),
    client: z
      .object({
        entry: z.string().optional(),
        base: z.string().optional().prefault('/_build'),
      })
      .optional()
      .prefault({}),
    server: z
      .object({
        entry: z.string().optional(),
        build: z
          .object({
            staticNodeEnv: z.boolean().optional().prefault(true),
          })
          .optional()
          .prefault({}),
      })
      .optional()
      .prefault({}),
    serverFns: z
      .object({
        base: z.string().optional().prefault('/_serverFn'),
        generateFunctionId: z
          .function({
            input: z.tuple([
              z.object({
              filename: z.string(),
              functionName: z.string(),
              })
            ]),
            output: z.string().optional(),
          })
          .optional(),
      })
      .optional()
      .prefault({}),
    pages: z.array(pageSchema).optional().prefault([]),
    sitemap: z
      .object({
        enabled: z.boolean().optional().prefault(true),
        host: z.string().optional(),
        outputPath: z.string().optional().prefault('sitemap.xml'),
      })
      .optional(),
    prerender: z
      .object({
        enabled: z.boolean().optional(),
        concurrency: z.number().optional(),
        filter: z.function({ input: z.tuple([pageSchema]), output: z.any() }).optional(),
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
  .prefault({})

export type Page = z.infer<typeof pageSchema>

export type TanStackStartInputConfig = z.input<
  typeof tanstackStartOptionsSchema
>
export type TanStackStartOutputConfig = ReturnType<typeof parseStartConfig>
