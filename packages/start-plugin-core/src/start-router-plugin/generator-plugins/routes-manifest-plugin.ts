import { rootRouteId } from '@tanstack/router-core'

import type {
  Generator,
  GeneratorPlugin,
  RouteNode,
} from '@tanstack/router-generator'

type RoutesManifest = Record<
  string,
  {
    filePath: string
    children?: Array<string>
  }
>

/**
 * The route id of a child in the route tree: mounted module roots are
 * `<moduleId>:`, or `<moduleId>#<as>:` for one of several installations.
 */
function childRouteId(node: RouteNode) {
  return node._routeModuleMount
    ? `${node._routeModuleMount.installation}:`
    : node.routePath
}

/**
 * this plugin builds the routes manifest and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export function routesManifestPlugin(): GeneratorPlugin {
  let generator: Generator | undefined
  return {
    name: 'routes-manifest-plugin',
    init: ({ generator: instance }) => {
      generator = instance
    },
    onRouteTreeChanged: ({ routeTree, rootRouteNode, routeNodes }) => {
      const allChildren = routeTree.map(childRouteId)
      const routes: RoutesManifest = {
        [rootRouteId]: {
          filePath: rootRouteNode.fullPath,
          children: allChildren as Array<string>,
        },
        ...Object.fromEntries(
          routeNodes
            .filter((d) => !d._routeModuleMount)
            .map((d) => {
              const filePathId = d.routePath

              return [
                filePathId,
                {
                  filePath: d.fullPath,
                  children: d.children?.map(
                    (childRoute) => childRouteId(childRoute) as string,
                  ),
                },
              ]
            }),
        ),
      }

      // Routes of mounted route modules, with their qualified ids.
      for (const route of generator?.getMountedRouteModuleRoutes() ?? []) {
        if (route.filePath) {
          const entry = (routes[route.id] ??= { filePath: route.filePath })
          entry.filePath = route.filePath
        }
        const parent = routes[route.parent]
        if (parent) {
          const children = (parent.children ??= [])
          if (!children.includes(route.id)) {
            children.push(route.id)
          }
        }
      }

      globalThis.TSS_ROUTES_MANIFEST = routes
    },
  }
}
