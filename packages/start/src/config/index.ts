import path from 'node:path'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import reactRefresh from '@vitejs/plugin-react'
import { resolve } from 'import-meta-resolve'
import { TanStackRouterVite, configSchema } from '@tanstack/router-plugin/vite'
import { TanStackStartVite } from '@tanstack/start-vite-plugin'
import { getConfig } from '@tanstack/router-generator'
import { createApp } from 'vinxi'
import { config } from 'vinxi/plugins/config'
// // @ts-expect-error
// import { serverComponents } from '@vinxi/server-components/plugin'
// @ts-expect-error
import { serverFunctions } from '@vinxi/server-functions/plugin'
// @ts-expect-error
import { serverTransform } from '@vinxi/server-functions/server'
import { z } from 'zod'
import type { RouterSchemaInput } from 'vinxi'
import type { Manifest } from '@tanstack/react-router'
import type * as vite from 'vite'

const _viteSchema = z.object({
  plugins: z.function().returns(z.array(z.custom<vite.Plugin>())).optional(),
})

const _babelSchema = z.object({
  plugins: z.array(z.union([z.tuple([z.string(), z.any()]), z.string()])),
})

const reactSchema = z.object({
  babel: _babelSchema.optional(),
  exclude: z.array(z.instanceof(RegExp)).optional(),
  include: z.array(z.instanceof(RegExp)).optional(),
})

const routersSchema = z.object({
  ssr: z
    .object({
      entry: z.string().optional(),
      vite: _viteSchema.optional(),
    })
    .optional(),
  client: z
    .object({
      entry: z.string().optional(),
      base: z.string().optional(),
      vite: _viteSchema.optional(),
    })
    .optional(),
  server: z
    .object({
      base: z.string().optional(),
      vite: _viteSchema.optional(),
    })
    .optional(),
})

const tsrConfig = configSchema.partial().merge(
  z.object({
    appDirectory: z.string(),
  }),
)

export const inlineConfigSchema = z.object({
  react: reactSchema.optional(),
  vite: _viteSchema.optional(),
  tsr: tsrConfig.optional(),
  routers: routersSchema.optional(),
})

export type InlineConfig = z.infer<typeof inlineConfigSchema>

function setTsrDefaults(
  config: InlineConfig['tsr'],
): Partial<InlineConfig['tsr']> {
  return {
    ...config,
    appDirectory: config?.appDirectory ?? './app',
    routesDirectory: config?.routesDirectory ?? './app/routes',
    generatedRouteTree: config?.generatedRouteTree ?? './app/routeTree.gen.ts',
    experimental: {
      ...config?.experimental,
    },
  }
}

export async function defineConfig(inlineConfig: InlineConfig = {}) {
  const opts = inlineConfigSchema.parse(inlineConfig)

  const tsrConfig = await getConfig(setTsrDefaults(opts.tsr))

  const clientBase = opts.routers?.client?.base || '/_build'

  const clientEntry = opts.routers?.client?.entry || './app/client.tsx'
  const ssrEntry = opts.routers?.ssr?.entry || './app/ssr.tsx'
  const serverBase = opts.routers?.server?.base || '/_server'

  return createApp({
    server: {
      preset: 'vercel',
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
      withStartPlugins(tsrConfig)({
        name: 'client',
        type: 'client',
        target: 'browser',
        handler: clientEntry,
        base: clientBase,
        build: {
          sourcemap: true,
        },
        plugins: () => [
          ...(opts.vite?.plugins?.() || []),
          ...(opts.routers?.client?.vite?.plugins?.() || []),
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
        ],
      }),
      withStartPlugins(tsrConfig)({
        name: 'ssr',
        type: 'http',
        target: 'server',
        handler: ssrEntry,
        plugins: () => [
          tsrRoutesManifest({
            tsrConfig,
            clientBase,
          }),
          ...(opts.vite?.plugins?.() || []),
          ...(opts.routers?.ssr?.vite?.plugins?.() || []),
          serverTransform({
            runtime: '@tanstack/start/server-runtime',
          }),
          config('start-ssr', {
            ssr: {
              external: ['@vinxi/react-server-dom/client'],
            },
          }),
        ],
        link: {
          client: 'client',
        },
      }),
      withStartPlugins(tsrConfig)({
        name: 'server',
        type: 'http',
        target: 'server',
        base: serverBase,
        // TODO: RSCS - enable this
        // worker: true,
        handler: importToProjectRelative('@tanstack/start/server-handler'),
        plugins: () => [
          serverFunctions.server({
            runtime: '@tanstack/start/react-server-runtime',
            // TODO: RSCS - remove this
            resolve: {
              conditions: [],
            },
          }),
          // TODO: RSCs - add this
          // serverComponents.serverActions({
          //   resolve: {
          //     conditions: [
          //       'react-server',
          //       // 'node',
          //       'import',
          //       process.env.NODE_ENV,
          //     ],
          //   },
          //   runtime: '@vinxi/react-server-dom/runtime',
          //   transpileDeps: ['react', 'react-dom', '@vinxi/react-server-dom'],
          // }),
          ...(opts.vite?.plugins?.() || []),
          ...(opts.routers?.server?.vite?.plugins?.() || []),
        ],
      }),
    ],
  })
}

function withStartPlugins(tsrConfig: z.infer<typeof configSchema>) {
  return (
    router: Extract<
      RouterSchemaInput,
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
    },
  ) => {
    return {
      ...router,
      plugins: async () => [
        config('start-vite', {
          ssr: {
            noExternal: ['@tanstack/start', 'tsr:routes-manifest'],
          },
          // optimizeDeps: {
          //   include: ['@tanstack/start/server-runtime'],
          // },
        }),
        TanStackRouterVite({
          ...tsrConfig,
          experimental: {
            ...tsrConfig.experimental,
            enableCodeSplitting: true,
          },
        }),
        TanStackStartVite(),
        ...((await router.plugins?.()) ?? []),
      ],
    }
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
    async load(id) {
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
          manifest = JSON.parse(await readFile(clientViteManifestPath, 'utf-8'))
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
          routeTreeContent = readFileSync(routeTreePath, 'utf-8')
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

        if (process.env.TSR_VITE_DEBUG)
          console.info(JSON.stringify(routesManifest, null, 2))

        return `export default () => (${JSON.stringify(routesManifest)})`
      }
      return
    },
  }
}
