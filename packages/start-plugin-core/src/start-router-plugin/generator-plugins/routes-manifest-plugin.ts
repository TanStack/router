import { rootRouteId } from '@tanstack/router-core'

import type { GeneratorPlugin } from '@tanstack/router-generator'

/**
 * this plugin builds the routes manifest and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export function routesManifestPlugin(): GeneratorPlugin {
  return {
    name: 'routes-manifest-plugin',
    onRouteTreesChanged: ({ routeTrees, rootRouteNode }) => {
      const routeTree = routeTrees.find((tree) => tree.exportName === 'Route')
      if (!routeTree) {
        throw new Error(
          'No route tree found with export name "Route". Please ensure your routes are correctly defined.',
        )
      }
      const routesManifest = {
        [rootRouteId]: {
          filePath: rootRouteNode.fullPath,
          children: routeTree.acc.routeTree.map((d) => d.routePath),
        },
        ...Object.fromEntries(
          routeTree.acc.routeNodes.map((d) => {
            const filePathId = d.routePath

            return [
              filePathId,
              {
                filePath: d.fullPath,
                parent: d.parent?.routePath ? d.parent.routePath : undefined,
                children: d.children?.map((childRoute) => childRoute.routePath),
              },
            ]
          }),
        ),
      }

      globalThis.TSS_ROUTES_MANIFEST = { routes: routesManifest }
    },
  }
}
