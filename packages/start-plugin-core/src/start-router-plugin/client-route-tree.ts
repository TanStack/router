import { SERVER_PROP } from './constants'
import type {
  Generator,
  GeneratorPlugin,
  ModelRoute,
  TreeModel,
} from '@tanstack/router-generator'

/**
 * Whether the route file of `route` records only server options (SPEC
 * J1.9, J2.15): a route whose options may hold a key the generator could
 * not read (a spread, a computed key) is never server-only.
 */
function isServerOnly(route: ModelRoute) {
  const props = route.props
  return (
    !!props &&
    !props.unknown &&
    props.known.size === 1 &&
    props.known.has(SERVER_PROP)
  )
}

/**
 * The client's route tree: without the routes that are server-only and
 * have only server-only descendants (SPEC J2.15). Every other route stays,
 * with the ancestors a surviving route needs.
 */
export function pruneServerOnlyRoutes(model: TreeModel): TreeModel {
  const kept = new Map<ModelRoute, ModelRoute>()
  const prune = (route: ModelRoute): ModelRoute | null => {
    const children = route.children
      .map(prune)
      .filter((child): child is ModelRoute => child !== null)
    if (children.length === 0 && isServerOnly(route)) {
      return null
    }
    const copy: ModelRoute = { ...route, children }
    kept.set(route, copy)
    return copy
  }
  const children = model.children
    .map(prune)
    .filter((child): child is ModelRoute => child !== null)
  const keep = (routes: ReadonlyArray<ModelRoute>) =>
    routes.flatMap((route) => {
      const copy = kept.get(route)
      return copy ? [copy] : []
    })
  return {
    root: model.root,
    routes: keep(model.routes),
    children,
    attachOrder: keep(model.attachOrder),
  }
}

/**
 * Serves the client route tree of a generator (bundler-neutral: the hosts
 * serve `code()` for the exact route tree module in the client
 * environment) and tells when its routes change without the route tree
 * file changing (an edit that makes a route server-only, or a page again).
 */
export function createClientRouteTree(opts: {
  onClientRoutesChange?: () => void
}) {
  let generator: Generator | undefined
  let routeIds: string | undefined

  const plugin: GeneratorPlugin = {
    name: 'start-client-tree-plugin',
    init({ generator: instance }) {
      generator = instance
    },
    onRouteTreeChanged({ model }) {
      const next = pruneServerOnlyRoutes(model)
        .routes.map((route) => route.id)
        .join('\n')
      if (routeIds !== undefined && routeIds !== next) {
        opts.onClientRoutesChange?.()
      }
      routeIds = next
    },
  }

  return {
    plugin,
    async code() {
      if (!generator) {
        throw new Error('Generator instance not initialized')
      }
      const model = await generator.getTreeModel()
      if (!model) {
        throw new Error('Route tree not generated')
      }
      return generator.printRouteTree(pruneServerOnlyRoutes(model), {
        disableTypes: true,
        header: [],
        footer: [],
      })
    },
  }
}
