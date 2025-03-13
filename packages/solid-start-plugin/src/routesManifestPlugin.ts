import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { PluginOption, ResolvedConfig } from 'vite'
import type { Manifest } from '@tanstack/router-core'
import type { TanStackStartOutputConfig } from './schema'

export function startManifestPlugin(
  opts: TanStackStartOutputConfig,
): PluginOption {
  let config: ResolvedConfig

  return {
    name: 'tsr-routes-manifest',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    // configEnvironment(env, envConfig) {
    //   config = envConfig.
    // },
    resolveId(id) {
      if (id === 'tsr:start-manifest') {
        return id
      }
      return
    },
    load(id) {
      if (id === 'tsr:start-manifest') {
        // If we're in development, return a dummy manifest

        if (config.command === 'serve') {
          return `export default () => ({
            entry: "$${process.env.TSS_CLIENT_BASE}/",
            routes: {}
          })`
        }

        const clientViteManifestPath = path.resolve(
          opts.root,
          'node_modules/.tanstack-start/client-dist/.vite/manifest.json',
        )

        type ViteManifest = Record<
          string,
          {
            file: string
            isEntry: boolean
            imports?: Array<string>
          }
        >

        let manifest: ViteManifest
        try {
          manifest = JSON.parse(readFileSync(clientViteManifestPath, 'utf-8'))
        } catch (err) {
          console.error(err)
          throw new Error(
            `Could not find the production client vite manifest at '${clientViteManifestPath}'!`,
          )
        }

        const routeTreePath = path.resolve(opts.tsr.generatedRouteTree)

        let routeTreeContent: string
        try {
          routeTreeContent = readFileSync(routeTreePath, 'utf-8')
        } catch (err) {
          console.error(err)
          throw new Error(
            `Could not find the generated route tree at '${routeTreePath}'!`,
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
              imports?: Array<string>
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

        const routesDirectoryFromRoot = path.relative(
          opts.root,
          opts.tsr.routesDirectory,
        )

        // Add preloads to the routes from the vite manifest
        Object.entries(routes).forEach(([k, v]) => {
          const file =
            filesByRouteFilePath[
              path.join(routesDirectoryFromRoot, v.filePath as string)
            ]

          if (file) {
            const preloads = (file.imports ?? []).map((d) =>
              path.join('/', manifest[d]!.file),
            )

            if (file.file) {
              preloads.unshift(path.join('/', file.file))
            }

            routes[k] = {
              ...v,
              preloads,
            }
          }
        })

        if (entryFile) {
          routes.__root__!.preloads = [
            path.join('/', entryFile.file),
            ...(entryFile.imports?.map((d) =>
              path.join('/', manifest[d]!.file),
            ) || []),
          ]
          routes.__root__!.assets = [
            ...(routes.__root__!.assets || []),
            {
              tag: 'script',
              attrs: {
                src: path.join('/', entryFile.file),
                type: 'module',
              },
            },
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

        // @ts-expect-error
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
