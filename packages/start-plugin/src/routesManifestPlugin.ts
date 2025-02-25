import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { configSchema } from '@tanstack/router-generator'
import type { PluginOption, ResolvedConfig } from 'vite'
import type { z } from 'zod'
import type { Manifest } from '@tanstack/react-router'

export function tsrRoutesManifestPlugin(opts: {
  tsrConfig: z.infer<typeof configSchema>
  clientBase: string
}): PluginOption {
  let config: ResolvedConfig

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
          `../client/${opts.clientBase}/.vite/manifest.json`,
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
          manifest = JSON.parse(readFileSync(clientViteManifestPath, 'utf-8'))
        } catch (err) {
          console.error(err)
          throw new Error(
            `Could not find the production client vite manifest at '${clientViteManifestPath}'!`,
          )
        }

        const routeTreePath = path.resolve(opts.tsrConfig.generatedRouteTree)

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

        // @ts-expect-error
        recurseRoute(routes.__root__)

        const routesManifest = {
          routes,
        }

        if (process.env.TSR_VITE_DEBUG) {
          console.info(
            'Routes Manifest: \n' + JSON.stringify(routesManifest, null, 2),
          )
        }

        return `export default () => (${JSON.stringify(routesManifest)})`
      }
      return
    },
  }
}
