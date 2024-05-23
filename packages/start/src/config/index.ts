/* eslint-disable no-shadow */
import path from 'path'
import { readFileSync, writeFileSync } from 'fs'
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
import type * as vite from 'vite'

const viteSchema = z
  .object({
    plugins: z.function().returns(z.array(z.custom<vite.Plugin>())),
  })
  .partial()

const babelSchema = z
  .object({
    plugins: z.array(z.union([z.tuple([z.string(), z.any()]), z.string()])),
  })
  .partial()

const reactSchema = z
  .object({
    babel: babelSchema,
  })
  .partial()

const routersSchema = z
  .object({
    ssr: z
      .object({
        entry: z.string(),
        vite: viteSchema,
      })
      .partial(),
    rsc: z
      .object({
        vite: viteSchema,
      })
      .partial(),
    client: z
      .object({
        entry: z.string(),
        base: z.string(),
        vite: viteSchema,
      })
      .partial(),
    server: z
      .object({
        vite: viteSchema,
      })
      .partial(),
  })
  .partial()

const optsSchema = z
  .object({
    tsr: configSchema.partial(),
    react: reactSchema,
    vite: viteSchema,
    routers: routersSchema,
  })
  .partial()
  .optional()

export async function defineConfig(opts?: z.infer<typeof optsSchema>) {
  optsSchema.parse(opts)

  const tsrConfig = await getConfig(opts?.tsr)

  const startVinxi = () => {
    return config('start-vite', {
      ssr: {
        noExternal: ['@tanstack/start', 'tsr:routes-manifest'],
      },
      optimizeDeps: {
        include: ['@tanstack/start/server-runtime'],
      },
      plugins: [
        TanStackRouterVite({
          ...opts?.tsr,
          experimental: {
            enableCodeSplitting: true,
            ...opts?.tsr?.experimental,
          },
        }),
      ],
    })
  }

  const clientBase = opts?.routers?.client?.base || '/_build'

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
      //     startVinxi(),
      //     ...(opts?.vite?.plugins?.() || []),
      //     ...(opts?.routers?.rsc?.vite?.plugins?.() || []),
      //     serverComponents.server(),
      //     reactRefresh(),
      //   ],
      // }),
      startRouterProxy({
        name: 'client',
        type: 'client',
        handler: opts?.routers?.client?.entry || './app/client.tsx',
        target: 'browser',
        base: clientBase,
        build: {
          sourcemap: true,
        },
        plugins: () => [
          startVinxi(),
          ...(opts?.vite?.plugins?.() || []),
          ...(opts?.routers?.client?.vite?.plugins?.() || []),
          serverFunctions.client({
            runtime: '@tanstack/start/client-runtime',
          }),
          reactRefresh({
            babel: opts?.react?.babel,
          }),
          // serverComponents.client(),
        ],
      }),
      startRouterProxy({
        name: 'ssr',
        type: 'http',
        handler: opts?.routers?.ssr?.entry || './app/server.tsx',
        target: 'server',
        plugins: () => [
          startVinxi(),
          tsrRoutesManifest({
            tsrConfig,
            clientBase,
          }),
          ...(opts?.vite?.plugins?.() || []),
          ...(opts?.routers?.ssr?.vite?.plugins?.() || []),
          serverTransform({
            runtime: '@tanstack/start/server-runtime',
          }),
        ],
        link: {
          client: 'client',
        },
      }),
      startRouterProxy(
        serverFunctions.router({
          name: 'server',
          plugins: () => [
            startVinxi(),
            ...(opts?.vite?.plugins?.() || []),
            ...(opts?.routers?.server?.vite?.plugins?.() || []),
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

function startRouterProxy(router: any) {
  return {
    ...router,
    plugins: async () => [
      TanStackRouterVite({
        experimental: {
          enableCodeSplitting: true,
        },
      }),
      ...((await router?.plugins?.()) ?? []),
    ],
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

        let manifest: any
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
        )

        const routes = routerManifest.routes

        let entryFile:
          | {
              imports: Array<string>
            }
          | undefined

        const assetsByRouteFilePath = Object.entries(manifest).reduce(
          (acc, [k, v]: any) => {
            if (v.isEntry) {
              entryFile = v
            }

            const rPath = k.split('?')[0]

            if (acc[rPath]) {
              acc[rPath] = [...acc[rPath], v]
            } else {
              acc[rPath] = [v]
            }

            return acc
          },
          {} as any,
        )

        // Add preloads to the routes from the vite manifest
        Object.entries(routes).forEach(([k, v]: any) => {
          const preloads = assetsByRouteFilePath[
            path.join(opts.tsrConfig.routesDirectory, v.filePath)
          ]
            ?.flatMap((d: any) => d.imports || [])
            .map((d: any) => path.join(opts.clientBase, manifest[d].file))

          routes[k] = {
            ...v,
            preloads,
          }
        })

        if (entryFile) {
          routes.__root__.preloads = entryFile.imports.map((d: any) =>
            path.join(opts.clientBase, manifest[d].file),
          )
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
              const childRoute = routes[child]
              recurseRoute(childRoute, { ...seenPreloads })
            })
          }
        }

        recurseRoute(routes.__root__)

        const routesManifest = {
          routes,
        }

        return `export default () => (${JSON.stringify(routesManifest)})`
      }
      return
    },
  }
}
