import { mkdirSync, readFileSync, rmSync, writeFile } from 'node:fs'
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
  basePath: string,
) => {
  const result: Array<RouterManagedTag> = []

  // Get all css imports from the file
  for (const cssFile of file.css ?? []) {
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
  for (const imp of file.imports ?? []) {
    const importInfo = filesByRouteFilePath[imp]
    if (importInfo) {
      result.push(
        ...getCSSRecursively(importInfo, filesByRouteFilePath, basePath),
      )
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

        // This is the basepath for the application
        const APP_BASE = globalThis.TSS_APP_BASE

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

        // This the manifest pulled from the generated route tree and later used by the Router.
        // i.e what's located in `src/generatedRouteTree.gen.ts`
        const routeTreeRoutes = routerManifest.routes

        // This is where hydration will start, from when the SSR'd page reaches the browser.
        // By default, this'd be the virtual entry of `/~start/default-client-entry.tsx`, unless a custom entry is provided.
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
        Object.entries(routeTreeRoutes).forEach(([routeId, v]) => {
          const file =
            filesByRouteFilePath[
              path.join(routesDirectoryFromRoot, v.filePath as string)
            ]

          if (file) {
            // Map the relevant imports to their route paths,
            // so that it can be imported in the browser.
            const preloads = (file.imports ?? []).map((d) => {
              const assetPath = joinURL(APP_BASE, viteManifest[d]!.file)
              return assetPath
            })

            // Since this is the most important JS entry for the route,
            // it should be moved to the front of the preloads so that
            // it has the best chance of being loaded first.
            if (file.file) {
              preloads.unshift(path.join(APP_BASE, file.file))
            }

            const cssAssetsList = getCSSRecursively(
              file,
              filesByRouteFilePath,
              APP_BASE,
            )

            routeTreeRoutes[routeId] = {
              ...v,
              assets: [...(v.assets || []), ...cssAssetsList],
              preloads,
            }
          }
        })

        if (entryFile) {
          routeTreeRoutes[rootRouteId]!.preloads = [
            joinURL(APP_BASE, entryFile.file),
            ...(entryFile.imports?.map((d) =>
              joinURL(APP_BASE, viteManifest[d]!.file),
            ) || []),
          ]

          // Gather all the CSS files from the entry file in
          // the `css` key and add them to the root route
          const entryCssAssetsList = getCSSRecursively(
            entryFile,
            filesByRouteFilePath,
            APP_BASE,
          )

          routeTreeRoutes[rootRouteId]!.assets = [
            ...(routeTreeRoutes[rootRouteId]!.assets || []),
            ...entryCssAssetsList,
            {
              tag: 'script',
              attrs: {
                src: joinURL(APP_BASE, entryFile.file),
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
              const childRoute = routeTreeRoutes[child]!
              recurseRoute(childRoute, { ...seenPreloads })
            })
          }
        }

        // @ts-expect-error
        recurseRoute(routeTreeRoutes[rootRouteId])

        const routesManifest = {
          routes: routeTreeRoutes,
        }

        try {
          const routesManifestOutputDirPath = path.resolve(
            opts.root,
            '.tanstack-start/build/routes-manifest',
          )
          rmSync(routesManifestOutputDirPath, {
            recursive: true,
            force: true,
          })
          mkdirSync(routesManifestOutputDirPath, { recursive: true })
          writeFile(
            path.join(routesManifestOutputDirPath, 'manifest.json'),
            JSON.stringify(routesManifest),
            (err) => {
              if (err) {
                console.error(
                  'There was an error writing the routes manifest to disk.\nYou can ignore this error. It does not affect the runtime of your application.',
                )
                console.error(err)
              }
            },
          )
        } catch (err) {
          console.error(
            'There was an error writing the routes manifest to disk.\nYou can ignore this error. It does not affect the runtime of your application.',
          )
          console.error(err)
        }

        return `export const tsrStartManifest = () => (${JSON.stringify(routesManifest)})`
      }

      return undefined
    },
  }
}
