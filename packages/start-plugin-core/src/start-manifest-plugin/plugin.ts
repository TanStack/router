import { joinURL } from 'ufo'
import { rootRouteId } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { tsrSplit } from '@tanstack/router-plugin'
import { resolveViteId } from '../utils'
import type { PluginOption, ResolvedConfig, Rollup } from 'vite'
import type { RouterManagedTag } from '@tanstack/router-core'

export const getCSSRecursively = (
  chunk: Rollup.OutputChunk,
  chunksByFileName: Map<string, Rollup.OutputChunk>,
  basePath: string,
) => {
  const result: Array<RouterManagedTag> = []

  // Get all css imports from the file
  for (const cssFile of chunk.viteMetadata?.importedCss ?? []) {
    result.push({
      tag: 'link',
      attrs: {
        rel: 'stylesheet',
        href: joinURL(basePath, cssFile),
        type: 'text/css',
      },
    })
  }

  // Recursively get CSS from imports
  for (const importedFileName of chunk.imports) {
    const importedChunk = chunksByFileName.get(importedFileName)
    if (importedChunk) {
      result.push(
        ...getCSSRecursively(importedChunk, chunksByFileName, basePath),
      )
    }
  }

  return result
}

const resolvedModuleId = resolveViteId(VIRTUAL_MODULES.startManifest)
export function startManifestPlugin(opts: {
  clientEntry: string
}): PluginOption {
  let config: ResolvedConfig

  return {
    name: 'tanstack-start:start-manifest-plugin',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    resolveId: {
      filter: { id: new RegExp(VIRTUAL_MODULES.startManifest) },
      handler(id) {
        if (id === VIRTUAL_MODULES.startManifest) {
          return resolvedModuleId
        }
        return undefined
      },
    },
    load: {
      filter: {
        id: new RegExp(resolvedModuleId),
      },
      handler(id) {
        if (id === resolvedModuleId) {
          if (this.environment.config.consumer !== 'server') {
            // this will ultimately fail the build if the plugin is used outside the server environment
            // TODO: do we need special handling for `serve`?
            return `export default {}`
          }

          // This is the basepath for the application
          const APP_BASE = globalThis.TSS_APP_BASE

          // If we're in development, return a dummy manifest
          if (config.command === 'serve') {
            return `export const tsrStartManifest = () => ({
            routes: {},
            clientEntry: '${joinURL(APP_BASE, opts.clientEntry)}',
          })`
          }

          // This the manifest pulled from the generated route tree and later used by the Router.
          // i.e what's located in `src/routeTree.gen.ts`
          const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST.routes

          // This is where hydration will start, from when the SSR'd page reaches the browser.
          // By default, this'd be the virtual entry of `/~start/default-client-entry.tsx`, unless a custom entry is provided.
          let entryFile: Rollup.OutputChunk | undefined

          const clientBundle = globalThis.TSS_CLIENT_BUNDLE
          const chunksByFileName = new Map<string, Rollup.OutputChunk>()

          const routeChunks: Record<
            string /** fullPath of route file **/,
            Array<Rollup.OutputChunk>
          > = {}
          for (const bundleEntry of Object.values(clientBundle)) {
            if (bundleEntry.type === 'chunk') {
              chunksByFileName.set(bundleEntry.fileName, bundleEntry)
              if (bundleEntry.isEntry) {
                if (entryFile) {
                  throw new Error(
                    `multiple entries detected: ${entryFile.fileName} ${bundleEntry.fileName}`,
                  )
                }
                entryFile = bundleEntry
              }
              const routePieces = bundleEntry.moduleIds.flatMap((m) => {
                const [id, query] = m.split('?')
                if (id === undefined) {
                  throw new Error('expected id to be defined')
                }
                if (query === undefined) {
                  return []
                }
                const searchParams = new URLSearchParams(query)
                const split = searchParams.get(tsrSplit)

                if (split !== null) {
                  return {
                    id,
                    split,
                  }
                }
                return []
              })
              if (routePieces.length > 0) {
                routePieces.forEach((r) => {
                  let array = routeChunks[r.id]
                  if (array === undefined) {
                    array = []
                    routeChunks[r.id] = array
                  }
                  array.push(bundleEntry)
                })
              }
            }
          }

          // Add preloads to the routes from the vite manifest
          Object.entries(routeTreeRoutes).forEach(([routeId, v]) => {
            if (!v.filePath) {
              throw new Error(`expected filePath to be set for ${routeId}`)
            }
            const chunks = routeChunks[v.filePath]
            if (chunks) {
              chunks.forEach((chunk) => {
                // Map the relevant imports to their route paths,
                // so that it can be imported in the browser.
                const preloads = chunk.imports.map((d) => {
                  const assetPath = joinURL(APP_BASE, d)
                  return assetPath
                })

                // Since this is the most important JS entry for the route,
                // it should be moved to the front of the preloads so that
                // it has the best chance of being loaded first.
                preloads.unshift(joinURL(APP_BASE, chunk.fileName))

                const cssAssetsList = getCSSRecursively(
                  chunk,
                  chunksByFileName,
                  APP_BASE,
                )

                routeTreeRoutes[routeId] = {
                  ...v,
                  assets: [...(v.assets || []), ...cssAssetsList],
                  preloads: [...(v.preloads || []), ...preloads],
                }
              })
            }
          })

          if (!entryFile) {
            throw new Error('No entry file found')
          }
          routeTreeRoutes[rootRouteId]!.preloads = [
            joinURL(APP_BASE, entryFile.fileName),
            ...entryFile.imports.map((d) => joinURL(APP_BASE, d)),
          ]

          // Gather all the CSS files from the entry file in
          // the `css` key and add them to the root route
          const entryCssAssetsList = getCSSRecursively(
            entryFile,
            chunksByFileName,
            APP_BASE,
          )

          routeTreeRoutes[rootRouteId]!.assets = [
            ...(routeTreeRoutes[rootRouteId]!.assets || []),
            ...entryCssAssetsList,
          ]

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
                const childRoute = routeTreeRoutes[child]!
                recurseRoute(childRoute, { ...seenPreloads })
              })
            }
          }

          recurseRoute(routeTreeRoutes[rootRouteId]!)

          const routesManifest = {
            routes: routeTreeRoutes,
            clientEntry: joinURL(APP_BASE, entryFile.fileName),
          }

          return `export const tsrStartManifest = () => (${JSON.stringify(routesManifest)})`
        }

        return undefined
      },
    },
  }
}
