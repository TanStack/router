import { tanstackRouterGenerator } from '@tanstack/router-plugin/vite'
import path from 'pathe'
import { normalizePath } from 'vite'
import { VITE_ENVIRONMENT_NAMES } from '../../constants'
import { routesManifestPlugin } from '../../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildRouteTreeFileFooterFromConfig } from '../../start-router-plugin/route-tree-footer'
import { createClientRouteTree } from '../../start-router-plugin/client-route-tree'
import type { GetConfigFn } from '../../types'
import type { RouterPluginContext } from '@tanstack/router-plugin/context'
import type { TanStackStartVitePluginCoreOptions } from '../types'
import type { DevEnvironment, Plugin, PluginOption } from 'vite'
import type { TanStackStartInputConfig } from '../../schema'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

  let clientEnvironment: DevEnvironment | null = null
  function invalidate() {
    if (!clientEnvironment) {
      return
    }

    const mod = clientEnvironment.moduleGraph.getModuleById(
      getGeneratedRouteTreePath(),
    )
    if (mod) {
      clientEnvironment.moduleGraph.invalidateModule(mod)
    }
    clientEnvironment.hot.send({ type: 'full-reload', path: '*' })
  }

  // The client gets the route tree without its server-only routes; when an
  // edit changes which routes those are, the client's tree module is
  // invalidated (the tree file itself may not change).
  const clientRouteTree = createClientRouteTree({
    onClientRoutesChange: invalidate,
  })

  let routeTreeFileFooter: Array<string> | null = null

  function getRouteTreeFileFooter() {
    if (routeTreeFileFooter) {
      return routeTreeFileFooter
    }
    routeTreeFileFooter = [
      ...buildRouteTreeFileFooterFromConfig({
        generatedRouteTreePath: getGeneratedRouteTreePath(),
        getConfig,
        corePluginOpts,
      }),
    ]
    return routeTreeFileFooter
  }

  let resolvedGeneratedRouteTreePath: string | null = null
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
      resolvedGeneratedRouteTreePath = normalizePath(
        getGeneratedRouteTreePath(),
      )
      // The route tree module itself, by its exact id (a query aside)
      ;(clientTreePlugin.load as LoadObjectHook).filter = {
        id: {
          include: new RegExp(
            `^${escapeRegExp(resolvedGeneratedRouteTreePath)}(?:\\?.*)?$`,
          ),
        },
      }
    },

    load: {
      filter: {
        // this will be set in the config hook above since it relies on `config` hook being called first
      },
      async handler(id) {
        if (
          normalizePath(id.replace(/\?.*$/, '')) !==
          resolvedGeneratedRouteTreePath
        ) {
          return null
        }
        return { code: await clientRouteTree.code(), map: null }
      },
    },
  }
  return [
    clientTreePlugin,
    tanstackRouterGenerator(() => {
      const routerConfig = getConfig().startConfig.router
      const plugins = [clientRouteTree.plugin, routesManifestPlugin()]
      if (startPluginOpts.prerender?.enabled === true) {
        plugins.push(prerenderRoutesPlugin())
      }
      return {
        ...routerConfig,
        target: corePluginOpts.framework,
        routeTreeFileFooter: getRouteTreeFileFooter,
        plugins,
      }
    }, routerPluginContext),
  ]
}
