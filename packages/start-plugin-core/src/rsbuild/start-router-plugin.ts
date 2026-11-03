import path from 'pathe'
import { createRouterPluginContext } from '@tanstack/router-plugin/context'
import {
  TanStackRouterCodeSplitterRspack,
  TanStackRouterGeneratorRspack,
} from '@tanstack/router-plugin/rspack'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildRouteTreeFileFooterFromConfig } from '../start-router-plugin/route-tree-footer'
import { createClientRouteTree } from '../start-router-plugin/client-route-tree'
import { cleanId } from '../start-compiler/utils'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { RsbuildPluginAPI } from '@rsbuild/core'
import type { GetConfigFn, TanStackStartCoreOptions } from '../types'
import type { TanStackStartRsbuildInputConfig } from './schema'

/**
 * Registers the TanStack Router generator and code-splitter plugins
 * as rspack plugins via `modifyRspackConfig`.
 *
 * The router-plugin package exports rspack-compatible unplugin wrappers:
 * - TanStackRouterGeneratorRspack: file-based route generation
 * - TanStackRouterCodeSplitterRspack: route code splitting
 */
export function registerRouterPlugins(
  api: RsbuildPluginAPI,
  opts: {
    getConfig: GetConfigFn
    corePluginOpts: TanStackStartCoreOptions
    startPluginOpts: TanStackStartRsbuildInputConfig
    onClientTreeInvalidated?: () => void
  },
): void {
  const routerPluginContext = createRouterPluginContext()
  const clientTree = createClientRouteTree(opts.onClientTreeInvalidated)

  api.transform(
    {
      test: (id: string) =>
        path.normalize(cleanId(id)) ===
        path.resolve(opts.getConfig().startConfig.router.generatedRouteTree),
      environments: [RSBUILD_ENVIRONMENT_NAMES.client],
      order: 'pre',
    },
    async ({ addDependency }) => {
      const result = await clientTree.build()
      for (const file of result.dependencies) {
        addDependency(file)
      }
      return result.code
    },
  )

  api.modifyRspackConfig((config, utils) => {
    const envName = utils.environment.name
    const { startConfig } = opts.getConfig()
    const routerConfig = startConfig.router

    // Generator only runs once — register for the client environment
    if (envName === RSBUILD_ENVIRONMENT_NAMES.client) {
      const generatorPlugin = TanStackRouterGeneratorRspack(
        {
          ...routerConfig,
          target: opts.corePluginOpts.framework,
          routeTreeFileFooter: () => {
            return buildRouteTreeFileFooterFromConfig({
              generatedRouteTreePath: path.resolve(
                routerConfig.generatedRouteTree,
              ),
              getConfig: opts.getConfig,
              corePluginOpts: opts.corePluginOpts,
            })
          },
          plugins: [
            clientTree.generatorPlugin,
            routesManifestPlugin(),
            ...(opts.startPluginOpts.prerender?.enabled === true
              ? [prerenderRoutesPlugin()]
              : []),
          ],
        },
        routerPluginContext,
      )
      utils.appendPlugins(generatorPlugin)
      utils.appendPlugins(
        new utils.rspack.NormalModuleReplacementPlugin(/./, (data) => {
          // afterResolve provides the physical resource; beforeResolve only has
          // the request. Leave package/alias resolution to Rspack itself.
          if (!data.createData) {
            return
          }
          const clientId = clientTree.getModuleClientTree(
            data.createData.resource,
          )
          if (clientId) {
            data.createData.resource = clientId
          }
        }),
      )
    }

    if (
      envName === RSBUILD_ENVIRONMENT_NAMES.client ||
      envName === RSBUILD_ENVIRONMENT_NAMES.server
    ) {
      const isClient = envName === RSBUILD_ENVIRONMENT_NAMES.client
      const splitterPlugin = TanStackRouterCodeSplitterRspack(
        {
          ...routerConfig,
          target: opts.corePluginOpts.framework,
          codeSplittingOptions: {
            ...routerConfig.codeSplittingOptions,
            deleteNodes: isClient ? ['ssr', 'server', 'headers'] : undefined,
            addHmr: isClient,
          },
        },
        routerPluginContext,
      )
      utils.appendPlugins(splitterPlugin)
    }
  })
}
