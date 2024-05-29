/* eslint-disable no-shadow */
import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import reactRefresh from '@vitejs/plugin-react'
import { resolve } from 'import-meta-resolve'
import { TanStackRouterVite, configSchema } from '@tanstack/router-vite-plugin'
import { getConfig } from '@tanstack/router-generator'
import { createApp } from 'vinxi'
import { config } from 'vinxi/plugins/config'
// @ts-expect-error
import { serverComponents } from '@vinxi/server-components/plugin'
// @ts-expect-error
import { serverFunctions } from '@vinxi/server-functions/plugin'
// @ts-expect-error
import { serverTransform } from '@vinxi/server-functions/server'
import { z } from 'zod'
import type { RouterSchemaInput } from 'vinxi'
import type { Manifest } from '@tanstack/react-router'
import type * as vite from 'vite'

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
})

const routersSchema = z.object({
  ssr: z
    .object({
      entry: z.string().default('./app/ssr.tsx'),
      vite: viteSchema.optional().default({}),
    })
    .optional()
    .default({}),
  // rsc: z
  //   .object({
  //     entry: z.string().default('./app/rsc.tsx'),
  //     vite: viteSchema,
  //   })
  //   .optional()
  //   .default({}),
  client: z
    .object({
      entry: z.string().optional().default('./app/client.tsx'),
      base: z.string().optional(),
      vite: viteSchema.optional().default({}),
    })
    .optional()
    .default({}),
  server: z
    .object({
      vite: viteSchema.optional().default({}),
      base: z.string().optional().default('/_server'),
    })
    .optional()
    .default({}),
})

const optsSchema = z
  .object({
    tsr: configSchema
      .partial()
      .extend({
        appDirectory: z.string().default('./app'),
        // Normally these are `./src/___`, but we're using `./app/___` for Start stuff
        routesDirectory: z.string().default('./app/routes'),
        generatedRouteTree: z.string().default('./app/routeTree.gen.ts'),
      })
      .optional()
      .default({}),
    react: reactSchema.optional().default({}),
    vite: viteSchema.optional().default({}),
    routers: routersSchema.optional().default({}),
  })
  .optional()
  .default({})

export async function defineConfig(opts_?: z.infer<typeof optsSchema>) {
  const opts = optsSchema.parse(opts_)

  const tsrConfig = await getConfig(opts.tsr)

  const clientBase = opts.routers.client.base || '/_build'

  const clientEntry = opts.routers.client.entry
  const ssrEntry = opts.routers.ssr.entry
  const serverBase = opts.routers.server.base
  // const rscEntry = opts.routers.rsc.entry

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
          ...(opts.vite.plugins?.() || []),
          ...(opts.routers.client.vite.plugins?.() || []),
          serverFunctions.client({
            runtime: '@tanstack/start/client-runtime',
          }),
          reactRefresh({
            babel: opts.react.babel,
          }),
          serverComponents.client(),
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
          ...(opts.vite.plugins?.() || []),
          ...(opts.routers.ssr.vite.plugins?.() || []),
          serverTransform({
            runtime: '@tanstack/start/server-runtime',
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
        worker: true,
        handler: importToProjectRelative('@tanstack/start/server-handler'),
        plugins: () => [
          serverFunctions.server({
            resolve: {
              conditions: ['react-server'],
            },
            runtime: '@tanstack/start/react-server-runtime',
          }),
          serverComponents.serverActions({
            resolve: {
              conditions: [
                'react-server',
                'node',
                'import',
                process.env.NODE_ENV,
              ],
            },
            runtime: '@vinxi/react-server-dom/runtime',
            transpileDeps: ['react', 'react-dom', '@vinxi/react-server-dom'],
          }),
          ...(opts.vite.plugins?.() || []),
          ...(opts.routers.server.vite.plugins?.() || []),
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
          optimizeDeps: {
            include: ['@tanstack/start/server-runtime'],
          },
        }),
        TanStackRouterVite({
          ...tsrConfig,
          experimental: {
            ...tsrConfig.experimental,
            enableCodeSplitting: true,
          },
        }),
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
  const toAbsolute = (file: string) => file.split('://').at(-1)!

  const resolved = toAbsolute(resolve(p, import.meta.url))

  const relative = path.relative(process.cwd(), resolved)

  return relative
}

function tsrRoutesManifest(opts: {
  tsrConfig: z.infer<typeof configSchema>
  clientBase: string
}) {
  let config: any

  return {
    name: 'tsr-routes-manifest',
    configResolved(resolvedConfig: any) {
      config = resolvedConfig
    },
    resolveId(id: string) {
      if (id === 'tsr:routes-manifest') {
        return id
      }
      return
    },
    async load(id: string) {
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
          console.log(err)
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

        const filesByRouteFilePath = Object.fromEntries(
          Object.entries(manifest).map(([k, v]: any) => {
            if (v.isEntry) {
              entryFile = v
            }

            const rPath = k.split('?')[0]

            return [rPath, v]
          }, {} as any),
        ) as ViteManifest

        // Add preloads to the routes from the vite manifest
        Object.entries(routes).forEach(([k, v]: any) => {
          const file =
            filesByRouteFilePath[
              path.join(opts.tsrConfig.routesDirectory, v.filePath)
            ]

          if (file) {
            const preloads = file.imports.map((d: any) =>
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
            ...entryFile.imports.map((d: any) =>
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
            route.children.forEach((child: any) => {
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
          console.log(JSON.stringify(routesManifest, null, 2))

        return `export default () => (${JSON.stringify(routesManifest)})`
      }
      return
    },
  }
}
