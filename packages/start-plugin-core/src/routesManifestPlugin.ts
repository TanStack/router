import { readFileSync } from 'node:fs'
import path from 'node:path'
import { joinURL } from 'ufo'
import { rootRouteId } from '@tanstack/router-core'
import { resolveViteId } from './utils'
import type {
  PluginOption,
  ResolvedConfig,
  Manifest as ViteManifest,
  ManifestChunk as ViteManifestChunk,
} from 'vite'
import type { Manifest, RouterManagedTag } from '@tanstack/router-core'
import type { TanStackStartOutputConfig } from './plugin'

const getCSSRecursively = (
  file: ViteManifestChunk,
  filesByRouteFilePath: ViteManifest,
) => {
  const result: Array<RouterManagedTag> = []

  // Get all css imports from the file
  for (const cssFile of file.css ?? []) {
    result.push({
      tag: 'link',
      attrs: {
        rel: 'stylesheet',
        href: joinURL('/', cssFile),
        type: 'text/css',
      },
    })
  }

  // Recursively get CSS from imports
  for (const imp of file.imports ?? []) {
    const importInfo = filesByRouteFilePath[imp]
    if (importInfo) {
      result.push(...getCSSRecursively(importInfo, filesByRouteFilePath))
    }
  }

  return result
}

export function startManifestPlugin(
  opts: TanStackStartOutputConfig,
): PluginOption {
  let config: ResolvedConfig

  const moduleId = 'tanstack-start-router-manifest:v'
  const resolvedModuleId = resolveViteId(moduleId)

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
      if (id === moduleId) {
        return resolvedModuleId
      }
      return
    },
    load(id) {
      if (id === resolvedModuleId) {
        if (this.environment.config.consumer !== 'server') {
          // this will ultimately fail the build if the plugin is used outside the server environment
          // TODO: do we need special handling for `serve`?
          return `export default {}`
        }
        // If we're in development, return a dummy manifest

        if (config.command === 'serve') {
          return `export const tsrStartManifest = () => ({
            entry: "$${process.env.TSS_CLIENT_BASE}/",
            routes: {}
          })`
        }

        const clientViteManifestPath = path.resolve(
          opts.root,
          '.tanstack-start/build/client-dist/.vite/manifest.json',
        )

        let viteManifest: ViteManifest
        try {
          viteManifest = JSON.parse(
            readFileSync(clientViteManifestPath, 'utf-8'),
          )
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

        let entryFile: ViteManifestChunk | undefined

        const filesByRouteFilePath: ViteManifest = Object.fromEntries(
          Object.entries(viteManifest).map(([k, v]) => {
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
              path.join('/', viteManifest[d]!.file),
            )

            if (file.file) {
              preloads.unshift(path.join('/', file.file))
            }

            const cssAssetsList = getCSSRecursively(file, filesByRouteFilePath)

            routes[k] = {
              ...v,
              assets: [...(v.assets || []), ...cssAssetsList],
              preloads,
            }
          }
        })

        if (entryFile) {
          routes[rootRouteId]!.preloads = [
            path.join('/', entryFile.file),
            ...(entryFile.imports?.map((d) =>
              path.join('/', viteManifest[d]!.file),
            ) || []),
          ]

          // Gather all the CSS files from the entry file in
          // the `css` key and add them to the root route
          const entryCssAssetsList = getCSSRecursively(
            entryFile,
            filesByRouteFilePath,
          )

          routes[rootRouteId]!.assets = [
            ...(routes[rootRouteId]!.assets || []),
            ...entryCssAssetsList,
            {
              tag: 'script',
              attrs: {
                src: joinURL('/', entryFile.file),
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
        recurseRoute(routes[rootRouteId])

        const routesManifest = {
          routes,
        }

        return `export const tsrStartManifest = () => (${JSON.stringify(routesManifest)})`
      }
      return
    },
  }
}
