/* eslint-disable no-shadow */
import path from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import reactRefresh from '@vitejs/plugin-react'
import { resolve } from 'import-meta-resolve'
import { TanStackRouterVite, configSchema } from '@tanstack/router-plugin/vite'
import { TanStackStartVite } from '@tanstack/start-vite-plugin'
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
import type { Manifest } from '@tanstack/react-router'
import type * as vite from 'vite'

const viteSchema = z
  .object({
    plugins: z.function().returns(z.array(z.custom<vite.Plugin>())).optional(),
  })
  .optional()
  .default({})

const babelSchema = z
  .object({
    plugins: z
      .array(z.union([z.tuple([z.string(), z.any()]), z.string()]))
      .optional(),
  })
  .optional()
  .default({})

const reactSchema = z
  .object({
    babel: babelSchema,
  })
  .optional()
  .default({})

const routersSchema = z
  .object({
    ssr: z
      .object({
        entry: z.string().default('./app/ssr.tsx'),
        vite: viteSchema,
      })
      .optional()
      .default({}),
    rsc: z
      .object({
        vite: viteSchema,
      })
      .optional()
      .default({}),
    client: z
      .object({
        entry: z.string().optional().default('./app/client.tsx'),
        base: z.string().optional(),
        vite: viteSchema,
      })
      .optional()
      .default({}),
    server: z
      .object({
        vite: viteSchema,
      })
      .optional()
      .default({}),
  })
  .optional()
  .default({})

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
    react: reactSchema,
    vite: viteSchema,
    routers: routersSchema,
  })
  .optional()
  .default({})

export async function defineConfig(opts_?: z.infer<typeof optsSchema>) {
  const opts = optsSchema.parse(opts_)

  const tsrConfig = await getConfig(opts.tsr)

  const startVite = () => {
    return config('start-vite', {
      ssr: {
        noExternal: ['@tanstack/start', 'tsr:routes-manifest'],
      },
      optimizeDeps: {
        include: ['@tanstack/start/server-runtime'],
      },
      plugins: [
        TanStackRouterVite({
          ...tsrConfig,
          experimental: {
            ...opts.tsr.experimental,
            enableCodeSplitting: true,
          },
        }),
      ],
    })
  }

  const clientBase = opts.routers.client.base || '/_build'

  const clientEntry = opts.routers.client.entry
  const ssrEntry = opts.routers.ssr.entry

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
      // startRouterProxy({
      //   name: 'rsc',
      //   worker: true,
      //   type: 'http',
      //   base: '/_rsc',
      //   handler: './app/react-server.tsx',
      //   target: 'server',
      //   plugins: () => [
      //     startVite(),
      //     ...(opts.vite?.plugins?.() || []),
      //     ...(opts.routers.rsc?.vite?.plugins?.() || []),
      //     serverComponents.server(),
      //     reactRefresh(),
      //   ],
      // }),
      startRouterProxy(tsrConfig)({
        name: 'client',
        type: 'client',
        handler: clientEntry,
        target: 'browser',
        base: clientBase,
        build: {
          sourcemap: true,
        },
        plugins: () => [
          startVite(),
          ...(opts.vite.plugins?.() || []),
          ...(opts.routers.client.vite.plugins?.() || []),
          serverFunctions.client({
            runtime: '@tanstack/start/client-runtime',
          }),
          reactRefresh({
            babel: opts.react.babel,
          }),
          // serverComponents.client(),
        ],
      }),
      startRouterProxy(tsrConfig)({
        name: 'ssr',
        type: 'http',
        handler: ssrEntry,
        target: 'server',
        plugins: () => [
          startVite(),
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
      startRouterProxy(tsrConfig)(
        serverFunctions.router({
          name: 'server',
          plugins: () => [
            startVite(),
            ...(opts.vite.plugins?.() || []),
            ...(opts.routers.server.vite.plugins?.() || []),
            // serverComponents.serverActions(),
          ],
          // For whatever reason, vinxi expects a path relative
          // to the project here. This is a workaround for that.
          handler: importToProjectRelative('@tanstack/start/server-handler'),
          runtime: '@tanstack/start/server-runtime',
        }),
      ),
    ],
  })
}

function startRouterProxy(tsrConfig: z.infer<typeof configSchema>) {
  return (router: any) => {
    return {
      ...router,
      plugins: async () => [
        TanStackRouterVite({
          ...tsrConfig,
          experimental: {
            ...tsrConfig.experimental,
            enableCodeSplitting: true,
          },
        }),
        TanStackStartVite(),
        ...((await router?.plugins?.()) ?? []),
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
