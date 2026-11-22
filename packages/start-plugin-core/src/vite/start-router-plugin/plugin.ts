import { tanstackRouterGenerator } from '@tanstack/router-plugin/vite'
import path from 'pathe'
import { normalizePath } from 'vite'
import { watchDependencies } from '@tanstack/router-utils/compiler'
import { VITE_ENVIRONMENT_NAMES } from '../../constants'
import { startGeneratorConfig } from '../../start-router-plugin/generator-config'
import { createClientRouteTree } from '../../start-router-plugin/client-route-tree'
import { createTreePaths } from '../../start-router-plugin/tree-paths'
import { escapeRegExp } from '../../utils'
import type { GetConfigFn } from '../../types'
import type { RouterPluginContext } from '@tanstack/router-plugin/context'
import type { TanStackStartVitePluginCoreOptions } from '../types'
import type { DevEnvironment, Plugin, PluginOption } from 'vite'
import type { TanStackStartInputConfig } from '../../schema'

/**
 * The route generator (and the client's route tree); route splitting and
 * HMR run inside Start's compiler plugin, on the registry the generator
 * publishes through `routerPluginContext`.
 */
export function tanStackStartRouter(
  startPluginOpts: TanStackStartInputConfig,
  getConfig: GetConfigFn,
  corePluginOpts: TanStackStartVitePluginCoreOptions,
  routerPluginContext: RouterPluginContext,
): Array<PluginOption> {
  const getGeneratedRouteTreePath = () => {
    const { startConfig } = getConfig()
    return path.resolve(startConfig.router.generatedRouteTree)
  }

  /** The tree module's ids: its configured and its real path (Vite resolves links). */
  const treePaths = createTreePaths(getGeneratedRouteTreePath)

  let clientEnvironment: DevEnvironment | null = null
  function invalidate() {
    if (!clientEnvironment) {
      return
    }

    for (const id of treePaths()) {
      const mod = clientEnvironment.moduleGraph.getModuleById(id)
      if (mod) {
        clientEnvironment.moduleGraph.invalidateModule(mod)
      }
    }
    clientEnvironment.hot.send({ type: 'full-reload', path: '*' })
  }

  // The client gets the route tree without its server-only routes; when an
  // edit changes which routes those are, the client's tree module is
  // invalidated (the tree file itself may not change).
  const clientRouteTree = createClientRouteTree({
    onClientRoutesChange: invalidate,
  })

  let resolvedGeneratedRouteTreePaths: ReadonlyArray<string> = []
  const clientTreePlugin: Plugin = {
    name: 'tanstack-start:route-tree-client-plugin',
    enforce: 'pre',
    applyToEnvironment: (env) => env.name === VITE_ENVIRONMENT_NAMES.client,
    configureServer(server) {
      clientEnvironment = server.environments[VITE_ENVIRONMENT_NAMES.client]
    },
    config() {
      type LoadObjectHook = Extract<
        typeof clientTreePlugin.load,
        { filter?: unknown }
      >
      resolvedGeneratedRouteTreePaths = treePaths()
      // The route tree module itself, by its exact id (a query aside)
      ;(clientTreePlugin.load as LoadObjectHook).filter = {
        id: {
          include: new RegExp(
            `^(?:${resolvedGeneratedRouteTreePaths.map(escapeRegExp).join('|')})(?:\\?.*)?$`,
          ),
        },
      }
    },

    load: {
      filter: {
        // this will be set in the config hook above since it relies on `config` hook being called first
      },
      async handler(id) {
        const file = normalizePath(id.replace(/\?.*$/, ''))
        if (!resolvedGeneratedRouteTreePaths.includes(file)) {
          return null
        }
        const tree = await clientRouteTree.code()
        // `vite build --watch`: the watcher reports an edit of a route the
        // tree left out (no client module imports it). A dev server
        // invalidates the tree itself (`onClientRoutesChange`)
        watchDependencies(this, tree, file)
        return { code: tree.code, map: null }
      },
    },
  }
  return [
    clientTreePlugin,
    tanstackRouterGenerator(
      () =>
        startGeneratorConfig({
          getConfig,
          corePluginOpts,
          prerender: startPluginOpts.prerender?.enabled === true,
          clientRouteTree: clientRouteTree.plugin,
        }),
      routerPluginContext,
    ),
  ]
}
