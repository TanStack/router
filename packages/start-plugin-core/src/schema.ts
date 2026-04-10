import path from 'node:path'
import { z } from 'zod'
import { configSchema, getConfig } from '@tanstack/router-plugin'
import type { Config } from '@tanstack/router-plugin'
import type { CompileStartFrameworkOptions, TanStackStartVitePluginCoreOptions } from './types'

const tsrConfig: z.ZodType<Partial<Omit<Config, 'autoCodeSplitting' | 'target' | 'verboseFileRoutes'>>> = configSchema
  .omit({ autoCodeSplitting: true, target: true, verboseFileRoutes: true })
  .partial() as any

// --- Import Protection Schema ---

const patternSchema = z.union([z.string(), z.instanceof(RegExp)])

type _ImportProtectionBehavior = 'error' | 'mock'

type _ImportProtectionEnvRules = {
  specifiers?: Array<string | RegExp>
  files?: Array<string | RegExp>
  excludeFiles?: Array<string | RegExp>
}

type _ImportProtectionOptions = {
  enabled?: boolean
  behavior?:
    | _ImportProtectionBehavior
    | {
        dev?: _ImportProtectionBehavior
        build?: _ImportProtectionBehavior
      }
  mockAccess?: 'error' | 'warn' | 'off'
  onViolation?: (arg: any) => boolean | void | Promise<boolean | void>
  include?: Array<string | RegExp>
  exclude?: Array<string | RegExp>
  client?: _ImportProtectionEnvRules
  server?: _ImportProtectionEnvRules
  ignoreImporters?: Array<string | RegExp>
  maxTraceDepth?: number
  log?: 'once' | 'always'
}

const importProtectionBehaviorSchema: z.ZodType<_ImportProtectionBehavior> = z.enum(['error', 'mock']) as any

const importProtectionEnvRulesSchema: z.ZodType<_ImportProtectionEnvRules> = z.object({
  specifiers: z.array(patternSchema).optional(),
  files: z.array(patternSchema).optional(),
  excludeFiles: z.array(patternSchema).optional(),
}) as any

const importProtectionOptionsSchema: z.ZodType<_ImportProtectionOptions | undefined> = z
  .object({
    enabled: z.boolean().optional(),
    behavior: z
      .union([
        importProtectionBehaviorSchema,
        z.object({
          dev: importProtectionBehaviorSchema.optional(),
          build: importProtectionBehaviorSchema.optional(),
        }),
      ])
      .optional(),
    /**
     * In `behavior: 'mock'`, control whether mocked imports emit a runtime
     * console diagnostic when accessed.
     *
     * - 'error': console.error(new Error(...)) (default)
     * - 'warn': console.warn(new Error(...))
     * - 'off': disable runtime diagnostics
     */
    mockAccess: z.enum(['error', 'warn', 'off']).optional(),
    onViolation: z
      .function()
      .args(z.any())
      .returns(
        z.union([
          z.boolean(),
          z.void(),
          z.promise(z.union([z.boolean(), z.void()])),
        ]),
      )
      .optional(),
    include: z.array(patternSchema).optional(),
    exclude: z.array(patternSchema).optional(),
    client: importProtectionEnvRulesSchema.optional(),
    server: importProtectionEnvRulesSchema.optional(),
    ignoreImporters: z.array(patternSchema).optional(),
    maxTraceDepth: z.number().optional(),
    log: z.enum(['once', 'always']).optional(),
  })
  .optional() as any

export function parseStartConfig(
  opts: z.input<typeof tanstackStartOptionsSchema>,
  corePluginOpts: TanStackStartVitePluginCoreOptions,
  root: string,
): Omit<_TanStackStartParsedOptions, 'router'> & {
  router: _TanStackStartParsedOptions['router'] &
    Config & { target: CompileStartFrameworkOptions }
} {
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

type _PageSitemapOptions = {
  exclude?: boolean
  priority?: number
  changefreq?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'
  lastmod?: string | Date
  alternateRefs?: Array<{ href: string; hreflang: string }>
  images?: Array<{ loc: string; caption?: string; title?: string }>
  news?: {
    publication: { name: string; language: string }
    publicationDate: string | Date
    title: string
  }
}

type _PagePrerenderOptions = {
  enabled?: boolean
  outputPath?: string
  autoSubfolderIndex?: boolean
  crawlLinks?: boolean
  retryCount?: number
  retryDelay?: number
  onSuccess?: (arg: {
    page: { path: string; sitemap?: _PageSitemapOptions; fromCrawl?: boolean }
    html: string
  }) => any
  headers?: Record<string, string>
}

type _Page = {
  path: string
  sitemap?: _PageSitemapOptions
  fromCrawl?: boolean
  prerender?: _PagePrerenderOptions
}

const pageSchema: z.ZodType<_Page> = pageBaseSchema.extend({
  prerender: pagePrerenderOptionsSchema.optional(),
}) as any

type _TanStackStartParsedOptions = {
  srcDirectory: string
  start: { entry?: string }
  router: { entry?: string; basepath?: string } & Partial<
    Omit<Config, 'autoCodeSplitting' | 'target' | 'verboseFileRoutes'>
  >
  client: { entry?: string; base: string }
  server: { entry?: string; build: { staticNodeEnv: boolean } }
  serverFns: {
    base: string
    generateFunctionId?: (arg: {
      filename: string
      functionName: string
    }) => string | undefined
  }
  pages: Array<_Page>
  sitemap?: { enabled: boolean; host?: string; outputPath: string }
  prerender?: {
    enabled?: boolean
    concurrency?: number
    filter?: (arg: _Page) => any
    failOnError?: boolean
    autoStaticPathsDiscovery?: boolean
    maxRedirects?: number
  } & (_PagePrerenderOptions | undefined)
  dev: {
    ssrStyles: { enabled: boolean; basepath?: string }
  }
  spa?: {
    enabled: boolean
    maskPath: string
    prerender: _PagePrerenderOptions & {
      outputPath: string
      crawlLinks: boolean
      retryCount: number
      enabled: true
    }
  }
  vite?: { installDevServerMiddleware?: boolean }
  importProtection: _ImportProtectionOptions | undefined
}

type _TanStackStartInputOptions = {
  srcDirectory?: string
  start?: { entry?: string }
  router?: { entry?: string; basepath?: string } & Partial<
    Omit<Config, 'autoCodeSplitting' | 'target' | 'verboseFileRoutes'>
  >
  client?: { entry?: string; base?: string }
  server?: { entry?: string; build?: { staticNodeEnv?: boolean } }
  serverFns?: {
    base?: string
    generateFunctionId?: (arg: {
      filename: string
      functionName: string
    }) => string | undefined
  }
  pages?: Array<_Page>
  sitemap?: { enabled?: boolean; host?: string; outputPath?: string }
  prerender?: {
    enabled?: boolean
    concurrency?: number
    filter?: (arg: _Page) => any
    failOnError?: boolean
    autoStaticPathsDiscovery?: boolean
    maxRedirects?: number
  } & (_PagePrerenderOptions | undefined)
  dev?: {
    ssrStyles?: { enabled?: boolean; basepath?: string }
  }
  spa?: {
    enabled?: boolean
    maskPath?: string
    prerender?: _PagePrerenderOptions
  }
  vite?: { installDevServerMiddleware?: boolean }
  importProtection?: _ImportProtectionOptions
} | undefined

const tanstackStartOptionsSchema: z.ZodType<
  _TanStackStartParsedOptions,
  z.ZodTypeDef,
  _TanStackStartInputOptions
> = z
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
        build: z
          .object({
            staticNodeEnv: z.boolean().optional().default(true),
          })
          .optional()
          .default({}),
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
    dev: z
      .object({
        ssrStyles: z
          .object({
            enabled: z.boolean().optional().default(true),
            basepath: z.string().optional(),
          })
          .optional()
          .default({}),
      })
      .optional()
      .default({}),
    spa: spaSchema.optional(),
    vite: z
      .object({ installDevServerMiddleware: z.boolean().optional() })
      .optional(),
    importProtection: importProtectionOptionsSchema,
  })
  .optional()
  .default({}) as any

export type Page = z.infer<typeof pageSchema>

export type TanStackStartInputConfig = z.input<
  typeof tanstackStartOptionsSchema
>
export type TanStackStartOutputConfig = ReturnType<typeof parseStartConfig>

export type ImportProtectionBehavior = z.infer<
  typeof importProtectionBehaviorSchema
>
export type ImportProtectionEnvRules = z.infer<
  typeof importProtectionEnvRulesSchema
>
export type ImportProtectionOptions = z.input<
  typeof importProtectionOptionsSchema
>
