import { rootRouteId } from '@tanstack/router-core'
import * as t from '@babel/types'
import { hasServerOptions } from '../pruneServerOnlySubtrees'
import { SERVER_PROP } from '../constants'
import type { CodeSplitCompilerPlugin } from '@tanstack/router-plugin'
import type { GeneratorPlugin } from '@tanstack/router-generator'

/**
 * this plugin builds the routes manifest and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export function routesManifestPlugin(
  isBuild: () => boolean,
): GeneratorPlugin & CodeSplitCompilerPlugin {
  let manifest: typeof globalThis.TSS_ROUTES_MANIFEST

  return {
    name: 'routes-manifest-plugin',
    onRouteTreeChanged: ({ routeTree, rootRouteNode, routeNodes }) => {
      const allChildren = routeTree.map((d) => d.routePath)
      let hasServerRoutes: boolean | undefined = isBuild() ? undefined : true
      const routes: Record<
        string,
        {
          filePath: string
          children: Array<string>
        }
      > = {
        [rootRouteId]: {
          filePath: rootRouteNode.fullPath,
          children: allChildren,
        },
        ...Object.fromEntries(
          routeNodes.map((d) => {
            const filePathId = d.routePath
            if (hasServerRoutes !== true && hasServerOptions(d) !== false) {
              hasServerRoutes = true
            }

            return [
              filePathId,
              {
                filePath: d.fullPath,
                children: d.children?.map((childRoute) => childRoute.routePath),
              },
            ]
          }),
        ),
      }

      manifest = { routes, hasServerRoutes }
      globalThis.TSS_ROUTES_MANIFEST = manifest
    },
    onRouteOptions({ routeOptions, createRouteFn, opts }) {
      if (!manifest || manifest.hasServerRoutes === true) {
        return
      }
      if (
        routeOptions.properties.some(
          (prop) =>
            t.isSpreadElement(prop) ||
            prop.computed ||
            t.isIdentifier(prop.key, { name: SERVER_PROP }) ||
            t.isStringLiteral(prop.key, { value: SERVER_PROP }),
        )
      ) {
        manifest.hasServerRoutes = true
      } else if (
        opts.id ===
          manifest.routes[rootRouteId]?.filePath.replaceAll('\\', '/') &&
        (createRouteFn === 'createRootRoute' ||
          createRouteFn === 'createRootRouteWithContext')
      ) {
        manifest.hasServerRoutes ??= false
      }
    },
  }
}
