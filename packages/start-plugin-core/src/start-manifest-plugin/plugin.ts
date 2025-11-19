import { joinURL } from 'ufo'
import { rootRouteId } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { tsrSplit } from '@tanstack/router-plugin'
import { resolveViteId } from '../utils'
import { ENTRY_POINTS } from '../constants'
import type { GetConfigFn } from '../plugin'
import type { PluginOption, Rollup } from 'vite'
import type { Manifest, RouterManagedTag } from '@tanstack/router-core'

const getCSSRecursively = (
  chunk: Rollup.OutputChunk,
  chunksByFileName: Map<string, Rollup.OutputChunk>,
  basePath: string,
  cache: Map<Rollup.OutputChunk, Array<RouterManagedTag>>,
  visited = new Set<Rollup.OutputChunk>(),
) => {
  if (visited.has(chunk)) {
    return []
  }
  visited.add(chunk)
  const cachedResult = cache.get(chunk)
  if (cachedResult) {
    return cachedResult
  }
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
        ...getCSSRecursively(
          importedChunk,
          chunksByFileName,
          basePath,
          cache,
          visited,
        ),
      )
    }
  }

  cache.set(chunk, result)
  return result
}

const resolvedModuleId = resolveViteId(VIRTUAL_MODULES.startManifest)
export function startManifestPlugin(opts: {
  getClientBundle: () => Rollup.OutputBundle
  getConfig: GetConfigFn
}): PluginOption {
  return {
    name: 'tanstack-start:start-manifest-plugin',
    enforce: 'pre',
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
        const { resolvedStartConfig } = opts.getConfig()
        if (id === resolvedModuleId) {
          if (this.environment.config.consumer !== 'server') {
            // this will ultimately fail the build if the plugin is used outside the server environment
            // TODO: do we need special handling for `serve`?
            return `export default {}`
          }

          // If we're in development, return a dummy manifest
          if (this.environment.config.command === 'serve') {
            return `export const tsrStartManifest = () => ({
            routes: {},
            clientEntry: '${joinURL(resolvedStartConfig.viteAppBase, '@id', ENTRY_POINTS.client)}',
          })`
          }

          // This the manifest pulled from the generated route tree and later used by the Router.
          // i.e what's located in `src/routeTree.gen.ts`
          const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST

          const cssPerChunkCache = new Map<
            Rollup.OutputChunk,
            Array<RouterManagedTag>
          >()

          // This is where hydration will start, from when the SSR'd page reaches the browser.
          let entryFile: Rollup.OutputChunk | undefined

          const clientBundle = opts.getClientBundle()
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

          const manifest: Manifest = { routes: {} }
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
                  const preloadPath = joinURL(
                    resolvedStartConfig.viteAppBase,
                    d,
                  )
                  return preloadPath
                })

                // Since this is the most important JS entry for the route,
                // it should be moved to the front of the preloads so that
                // it has the best chance of being loaded first.
                preloads.unshift(
                  joinURL(resolvedStartConfig.viteAppBase, chunk.fileName),
                )

                const assets = getCSSRecursively(
                  chunk,
                  chunksByFileName,
                  resolvedStartConfig.viteAppBase,
                  cssPerChunkCache,
                )

                manifest.routes[routeId] = {
                  ...v,
                  assets,
                  preloads,
                }
              })
            } else {
              manifest.routes[routeId] = v
            }
          })

          if (!entryFile) {
            throw new Error('No entry file found')
          }

          manifest.routes[rootRouteId] = manifest.routes[rootRouteId] || {}
          manifest.routes[rootRouteId].preloads = [
            joinURL(resolvedStartConfig.viteAppBase, entryFile.fileName),
            ...entryFile.imports.map((d) =>
              joinURL(resolvedStartConfig.viteAppBase, d),
            ),
          ]

          // Gather all the CSS files from the entry file in
          // the `css` key and add them to the root route
          const entryCssAssetsList = getCSSRecursively(
            entryFile,
            chunksByFileName,
            resolvedStartConfig.viteAppBase,
            cssPerChunkCache,
          )

          manifest.routes[rootRouteId].assets = [
            ...(manifest.routes[rootRouteId].assets || []),
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
                const childRoute = manifest.routes[child]!
                recurseRoute(childRoute, { ...seenPreloads })
              })
            }
          }

          recurseRoute(manifest.routes[rootRouteId])

          // Filter out routes that have neither assets nor preloads
          Object.keys(manifest.routes).forEach((routeId) => {
            const route = manifest.routes[routeId]!
            const hasAssets = route.assets && route.assets.length > 0
            const hasPreloads = route.preloads && route.preloads.length > 0
            if (!hasAssets && !hasPreloads) {
              delete routeTreeRoutes[routeId]
            }
          })

          const startManifest = {
            routes: manifest.routes,
            clientEntry: joinURL(
              resolvedStartConfig.viteAppBase,
              entryFile.fileName,
            ),
          }

          return `export const tsrStartManifest = () => (${JSON.stringify(startManifest)})`
        }

        return undefined
      },
    },
  }
}
