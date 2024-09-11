import path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import reactRefresh from '@vitejs/plugin-react'
import { resolve } from 'import-meta-resolve'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { TanStackStartVite } from '@tanstack/start-vite-plugin'
import {
  configSchema,
  getConfig,
  startAPIRouteSegmentsFromTSRFilePath,
} from '@tanstack/router-generator'
import { createApp } from 'vinxi'
import { config } from 'vinxi/plugins/config'
import {
  BaseFileSystemRouter as VinxiBaseFileSystemRouter,
  analyzeModule as vinxiFsRouterAnalyzeModule,
  cleanPath as vinxiFsRouterCleanPath,
} from 'vinxi/fs-router'
// // @ts-expect-error
// import { serverComponents } from '@vinxi/server-components/plugin'
// @ts-expect-error
import { serverFunctions } from '@vinxi/server-functions/plugin'
// @ts-expect-error
import { serverTransform } from '@vinxi/server-functions/server'
import { z } from 'zod'
import type * as vite from 'vite'
import type {
  AppOptions as VinxiAppOptions,
  RouterSchemaInput as VinxiRouterSchemaInput,
} from 'vinxi'
import type { Manifest } from '@tanstack/react-router'

/**
 * Not all the deployment presets are fully functional or tested.
 * @see https://github.com/TanStack/router/pull/2002
 */
const vinxiDeploymentPresets = [
  'alwaysdata', // untested
  'aws-amplify', // untested
  'aws-lambda', // untested
  'azure', // untested
  'azure-functions', // untested
  'base-worker', // untested
  'bun', // ✅ working
  'cleavr', // untested
  'cli', // untested
  'cloudflare', // untested
  'cloudflare-module', // untested
  'cloudflare-pages', // ✅ working
  'cloudflare-pages-static', // untested
  'deno', // untested
  'deno-deploy', // untested
  'deno-server', // untested
  'digital-ocean', // untested
  'edgio', // untested
  'firebase', // untested
  'flight-control', // untested
  'github-pages', // untested
  'heroku', // untested
  'iis', // untested
  'iis-handler', // untested
  'iis-node', // untested
  'koyeb', // untested
  'layer0', // untested
  'netlify', // ✅ working
  'netlify-builder', // untested
  'netlify-edge', // untested
  'netlify-static', // untested
  'nitro-dev', // untested
  'nitro-prerender', // untested
  'node', // partially working
  'node-cluster', // untested
  'node-server', // ✅ working
  'platform-sh', // untested
  'service-worker', // untested
  'static', // partially working
  'stormkit', // untested
  'vercel', // ✅ working
  'vercel-edge', // untested
  'vercel-static', // untested
  'winterjs', // untested
  'zeabur', // untested
  'zeabur-static', // untested
] as const

type DeploymentPreset = (typeof vinxiDeploymentPresets)[number] | (string & {})

const testedDeploymentPresets: Array<DeploymentPreset> = [
  'bun',
  'netlify',
  'vercel',
  'cloudflare-pages',
  'node-server',
]
const staticDeploymentPresets: Array<DeploymentPreset> = [
  'cloudflare-pages-static',
  'netlify-static',
  'static',
  'vercel-static',
  'zeabur-static',
]

function checkDeploymentPresetInput(preset: string): DeploymentPreset {
  if (!vinxiDeploymentPresets.includes(preset as any)) {
    console.warn(
      `Invalid deployment preset "${preset}". Available presets are: ${vinxiDeploymentPresets
        .map((p) => `"${p}"`)
        .join(', ')}.`,
    )
  }

  if (!testedDeploymentPresets.includes(preset as any)) {
    console.warn(
      `The deployment preset '${preset}' is not fully supported yet and may not work as expected.`,
    )
  }

  return preset
}

const deploymentSchema = z.object({
  preset: z.custom<DeploymentPreset>().optional(),
  static: z.boolean().optional(),
  prerender: z
    .object({
      routes: z.array(z.string()),
      ignore: z
        .array(
          z.custom<
            string | RegExp | ((path: string) => undefined | null | boolean)
          >(),
        )
        .optional(),
      crawlLinks: z.boolean().optional(),
    })
    .optional(),
})

const viteSchema = z.object({
  plugins: z.function().returns(z.array(z.custom<vite.Plugin>())).optional(),
})

const babelSchema = z.object({
  plugins: z
    .array(z.union([z.tuple([z.string(), z.any()]), z.string()]))
    .optional(),
})

const reactSchema = z.object({
  babel: babelSchema.optional(),
  exclude: z.array(z.instanceof(RegExp)).optional(),
  include: z.array(z.instanceof(RegExp)).optional(),
})

const routersSchema = z.object({
  ssr: z
    .object({
      entry: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  client: z
    .object({
      entry: z.string().optional(),
      base: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  server: z
    .object({
      base: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  api: z
    .object({
      entry: z.string().optional(),
    })
    .optional(),
})

const tsrConfig = configSchema.partial().extend({
  appDirectory: z.string(),
})

const inlineConfigSchema = z.object({
  react: reactSchema.optional(),
  vite: viteSchema.optional(),
  tsr: tsrConfig.optional(),
  routers: routersSchema.optional(),
  deployment: deploymentSchema.optional(),
})

export type TanStackStartDefineConfigOptions = z.infer<
  typeof inlineConfigSchema
>

function setTsrDefaults(
  config: TanStackStartDefineConfigOptions['tsr'],
): Partial<TanStackStartDefineConfigOptions['tsr']> {
  return {
    ...config,
    // Normally these are `./src/___`, but we're using `./app/___` for Start stuff
    appDirectory: config?.appDirectory ?? './app',
    routesDirectory: config?.routesDirectory ?? './app/routes',
    generatedRouteTree: config?.generatedRouteTree ?? './app/routeTree.gen.ts',
    experimental: {
      ...config?.experimental,
    },
  }
}

export function defineConfig(
  inlineConfig: TanStackStartDefineConfigOptions = {},
) {
  const opts = inlineConfigSchema.parse(inlineConfig)

  const { preset: configDeploymentPreset, ...deploymentOptions } =
    deploymentSchema.parse(opts.deployment || {})

  const deploymentPreset = checkDeploymentPresetInput(
    configDeploymentPreset || 'vercel',
  )
  const isStaticDeployment =
    deploymentOptions.static ??
    staticDeploymentPresets.includes(deploymentPreset)

  const tsrConfig = getConfig(setTsrDefaults(opts.tsr))

  const clientBase = opts.routers?.client?.base || '/_build'
  const serverBase = opts.routers?.server?.base || '/_server'
  const apiBase = opts.tsr?.apiBase || '/api'

  const clientEntry = opts.routers?.client?.entry || './app/client.tsx'
  const ssrEntry = opts.routers?.ssr?.entry || './app/ssr.tsx'
  const apiEntry = opts.routers?.api?.entry || './app/api.ts'

  const apiEntryExists = fs.existsSync(apiEntry)

  return createApp({
    server: {
      ...deploymentOptions,
      static: isStaticDeployment,
      preset: deploymentPreset,
      experimental: {
        asyncContext: true,
      },
    },
    routers: [
      {
        name: 'public',
        type: 'static',
        dir: './public',
        base: '/',
      },
      withPlugins(
        {
          name: 'client',
          type: 'client',
          target: 'browser',
          handler: clientEntry,
          base: clientBase,
          build: {
            sourcemap: true,
          },
        },
        (prev) => [
          config('start-vite', {
            ssr: {
              noExternal: ['@tanstack/start', 'tsr:routes-manifest'],
            },
            // optimizeDeps: {
            //   include: ['@tanstack/start/server-runtime'],
            // },
            define: {
              CLIENT_BASE: JSON.stringify(clientBase),
            },
          }),
          TanStackRouterVite({
            ...tsrConfig,
            autoCodeSplitting: true,
            experimental: {
              ...tsrConfig.experimental,
            },
            enableRouteGeneration: true,
          }),
          TanStackStartVite(),
          serverFunctions.client({
            runtime: '@tanstack/start/client-runtime',
          }),
          reactRefresh({
            babel: opts.react?.babel,
            exclude: opts.react?.exclude,
            include: opts.react?.include,
          }),
          // TODO: RSCS - enable this
          // serverComponents.client(),
          // This will log the final source of every file that is transformed by Vite
          // (() => {
          //   let rootDir = process.cwd()

          //   return {
          //     name: 'log-final-source',
          //     enforce: 'post', // Ensures this is one of the last plugins to apply transformations
          //     configResolved(config: any) {
          //       // store the root directory of the project
          //       rootDir = config.root
          //     },
          //     resolveId(id: string) {
          //       console.log(id)
          //     },
          //     transform(code: string, id: string) {
          //       // if we're in dev, write every file to a temp directory for debugging
          //       if (process.env.NODE_ENV === 'development') {
          //         const normalizedPath = vite.normalizePath(id)

          //         if (normalizedPath.startsWith(rootDir)) {
          //           const relativePath = normalizedPath.replace(rootDir, '')
          //           const filePath = path.join(rootDir, '.temp', relativePath)
          //           const directoryPath = path.dirname(filePath)
          //           // Ensure the directory exists
          //           fs.mkdirSync(directoryPath, {
          //             recursive: true,
          //           })
          //           fs.writeFileSync(filePath, code)
          //         }
          //       }

          //       return null // Return null to indicate no transformation is applied
          //     },
          //   }
          // })(),
          ...prev,
          ...(opts.vite?.plugins?.() || []),
          ...(opts.routers?.client?.vite?.plugins?.() || []),
        ],
      ),
      ...(apiEntryExists
        ? [
            withPlugins(
              {
                name: 'api',
                type: 'http',
                target: 'server',
                base: apiBase,
                handler: apiEntry,
                routes: tsrFileRouter({ tsrConfig, apiBase }),
              },
              (prev) => [
                config('start-vite', {
                  ssr: {
                    noExternal: ['@tanstack/start', 'tsr:routes-manifest'],
                  },
                  define: {
                    'process.env.CLIENT_BASE': JSON.stringify(clientBase),
                  },
                }),
                TanStackRouterVite({
                  ...tsrConfig,
                  autoCodeSplitting: true,
                  experimental: {
                    ...tsrConfig.experimental,
                  },
                  enableRouteGeneration: false,
                }),
                ...prev,
                ...(opts.vite?.plugins?.() || []),
                ...(opts.routers?.ssr?.vite?.plugins?.() || []),
              ],
            ),
          ]
        : []),
      withPlugins(
        {
          name: 'ssr',
          type: 'http',
          target: 'server',
          handler: ssrEntry,
          link: {
            client: 'client',
          },
        },
        (prev) => [
          config('start-ssr', {
            ssr: {
              noExternal: ['@tanstack/start', 'tsr:routes-manifest'],
              external: ['@vinxi/react-server-dom/client'],
            },
            define: {
              'process.env.CLIENT_BASE': JSON.stringify(clientBase),
            },
          }),
          TanStackRouterVite({
            ...tsrConfig,
            autoCodeSplitting: true,
            experimental: {
              ...tsrConfig.experimental,
            },
            enableRouteGeneration: true,
          }),
          TanStackStartVite(),
          tsrRoutesManifest({
            tsrConfig,
            clientBase,
          }),
          serverTransform({
            runtime: '@tanstack/start/server-runtime',
          }),
          ...prev,
          ...(opts.vite?.plugins?.() || []),
          ...(opts.routers?.ssr?.vite?.plugins?.() || []),
        ],
      ),
      withPlugins(
        {
          name: 'server',
          type: 'http',
          target: 'server',
          base: serverBase,
          // TODO: RSCS - enable this
          // worker: true,
          handler: importToProjectRelative('@tanstack/start/server-handler'),
        },
        (prev) => [
          config('start-server', {
            ssr: {
              noExternal: ['@tanstack/start', 'tsr:routes-manifest'],
            },
            define: {
              'process.env.CLIENT_BASE': JSON.stringify(clientBase),
            },
          }),
          TanStackRouterVite({
            ...tsrConfig,
            autoCodeSplitting: true,
            experimental: {
              ...tsrConfig.experimental,
            },
            enableRouteGeneration: true,
          }),
          TanStackStartVite(),
          serverFunctions.server({
            runtime: '@tanstack/start/react-server-runtime',
            // TODO: RSCS - remove this
            resolve: {
              conditions: [],
            },
          }),
          ...prev,
          ...(opts.vite?.plugins?.() || []),
          ...(opts.routers?.ssr?.vite?.plugins?.() || []),
        ],
      ),
    ],
  })
}

type TempRouter = Extract<
  VinxiRouterSchemaInput,
  {
    type: 'client' | 'http'
  }
> & {
  base?: string
  link?: {
    client: string
  }
  runtime?: string
  build?: {
    sourcemap?: boolean
  }
}

function withPlugins(
  router: TempRouter,
  plugins: (r: Array<any>) => Array<any>,
) {
  return {
    ...router,
    plugins: async (r: any) =>
      plugins((await router.plugins?.(r)) || router.plugins || []),
  }
}

// function resolveRelativePath(p: string) {
//   return path.relative(
//     process.cwd(),
//     resolve(p, import.meta.url)
//       .split('://')
//       .at(-1)!,
//   )
// }

function importToProjectRelative(p: string) {
  const resolved = fileURLToPath(resolve(p, import.meta.url))

  const relative = path.relative(process.cwd(), resolved)

  return relative
}

function tsrRoutesManifest(opts: {
  tsrConfig: z.infer<typeof configSchema>
  clientBase: string
}): vite.Plugin {
  let config: vite.ResolvedConfig

  return {
    name: 'tsr-routes-manifest',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    resolveId(id) {
      if (id === 'tsr:routes-manifest') {
        return id
      }
      return
    },
    load(id) {
      if (id === 'tsr:routes-manifest') {
        // If we're in development, return a dummy manifest

        if (config.command === 'serve') {
          return `export default () => ({
            routes: {}
          })`
        }

        const clientViteManifestPath = path.resolve(
          config.build.outDir,
          '../client/_build/.vite/manifest.json',
        )

        type ViteManifest = Record<
          string,
          {
            file: string
            isEntry: boolean
            imports: Array<string>
          }
        >

        let manifest: ViteManifest
        try {
          manifest = JSON.parse(
            fs.readFileSync(clientViteManifestPath, 'utf-8'),
          )
        } catch (err) {
          console.error(err)
          throw new Error(
            `Could not find the production client vite manifest at '${path.resolve(
              config.build.outDir,
              '../client/_build/.vite/manifest.json',
            )}'!`,
          )
        }

        const routeTreePath = path.resolve(opts.tsrConfig.generatedRouteTree)

        let routeTreeContent: string
        try {
          routeTreeContent = fs.readFileSync(routeTreePath, 'utf-8')
        } catch (err) {
          throw new Error(
            `Could not find the generated route tree at '${path.resolve(
              opts.tsrConfig.generatedRouteTree,
            )}'!`,
          )
        }

        // Extract the routesManifest JSON from the route tree file.
        // It's located between the /* ROUTE_MANIFEST_START and ROUTE_MANIFEST_END */ comment block.

        const routerManifest = JSON.parse(
          routeTreeContent.match(
            /\/\* ROUTE_MANIFEST_START([\s\S]*?)ROUTE_MANIFEST_END \*\//,
          )?.[1] || '{ routes: {} }',
        ) as Manifest

        const routes = routerManifest.routes

        let entryFile:
          | {
              file: string
              imports: Array<string>
            }
          | undefined

        const filesByRouteFilePath: ViteManifest = Object.fromEntries(
          Object.entries(manifest).map(([k, v]) => {
            if (v.isEntry) {
              entryFile = v
            }

            const rPath = k.split('?')[0]

            return [rPath, v]
          }, {}),
        )

        // Add preloads to the routes from the vite manifest
        Object.entries(routes).forEach(([k, v]) => {
          const file =
            filesByRouteFilePath[
              path.join(opts.tsrConfig.routesDirectory, v.filePath as string)
            ]

          if (file) {
            const preloads = file.imports.map((d) =>
              path.join(opts.clientBase, manifest[d]!.file),
            )

            preloads.unshift(path.join(opts.clientBase, file.file))

            routes[k] = {
              ...v,
              preloads,
            }
          }
        })

        if (entryFile) {
          routes.__root__!.preloads = [
            path.join(opts.clientBase, entryFile.file),
            ...entryFile.imports.map((d) =>
              path.join(opts.clientBase, manifest[d]!.file),
            ),
          ]
        }

        const recurseRoute = (
          route: {
            preloads?: Array<string>
            children?: Array<any>
          },
          seenPreloads = {} as Record<string, true>,
        ) => {
          route.preloads = route.preloads?.filter((preload) => {
            if (seenPreloads[preload]) {
              return false
            }
            seenPreloads[preload] = true
            return true
          })

          if (route.children) {
            route.children.forEach((child) => {
              const childRoute = routes[child]!
              recurseRoute(childRoute, { ...seenPreloads })
            })
          }
        }

        recurseRoute(routes.__root__!)

        const routesManifest = {
          routes,
        }

        if (process.env.TSR_VITE_DEBUG) {
          console.info(JSON.stringify(routesManifest, null, 2))
        }

        return `export default () => (${JSON.stringify(routesManifest)})`
      }
      return
    },
  }
}

function tsrFileRouter(opts: {
  tsrConfig: z.infer<typeof configSchema>
  apiBase: string
}) {
  const apiBaseSegment = opts.apiBase.split('/').filter(Boolean).join('/')
  const isAPIPath = new RegExp(`/${apiBaseSegment}/`)

  return function (router: VinxiRouterSchemaInput, app: VinxiAppOptions) {
    // Our own custom File Router that extends the VinxiBaseFileSystemRouter
    // for splitting the API routes into its own "bundle"
    // and adding the $APIRoute metadata to the route object
    // This could be customized in future to support more complex splits
    class TanStackStartFsRouter extends VinxiBaseFileSystemRouter {
      toPath(src: string): string {
        const inputPath = vinxiFsRouterCleanPath(src, this.config)

        const segments = startAPIRouteSegmentsFromTSRFilePath(
          inputPath,
          opts.tsrConfig,
        )

        const pathname = segments
          .map((part) => {
            if (part.type === 'splat') {
              return `*splat`
            }

            if (part.type === 'param') {
              return `:${part.value}?`
            }

            return part.value
          })
          .join('/')

        return pathname.length > 0 ? `/${pathname}` : '/'
      }

      toRoute(src: string) {
        const webPath = this.toPath(src)

        const [_, exports] = vinxiFsRouterAnalyzeModule(src)

        const hasRoute = exports.find((exp) => exp.n === 'Route')

        return {
          path: webPath,
          filePath: src,
          $APIRoute:
            isAPIPath.test(webPath) && hasRoute
              ? {
                  src,
                  pick: ['Route'],
                }
              : undefined,
        }
      }
    }

    return new TanStackStartFsRouter(
      {
        dir: opts.tsrConfig.routesDirectory,
        extensions: ['js', 'jsx', 'ts', 'tsx'],
      },
      router,
      app,
    )
  }
}
