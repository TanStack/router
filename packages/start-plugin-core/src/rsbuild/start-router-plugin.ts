import { utimes } from 'node:fs/promises'
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
  },
): void {
  const routerPluginContext = createRouterPluginContext()
  let generatedRouteTreePath: string | undefined
  const generatedRouteTree = () =>
    (generatedRouteTreePath ??= path.normalize(
      path.resolve(opts.getConfig().startConfig.router.generatedRouteTree),
    ))

  // The client gets the route tree without its server-only routes (SPEC
  // J2.15), served for the route tree module of the client environment. An
  // edit that changes which routes those are may leave the tree file as it
  // is: in dev, the file's modification time is touched so that the client
  // compiler loads it again.
  const clientRouteTree = createClientRouteTree({
    onClientRoutesChange: () => {
      if (api.context.action !== 'dev') {
        return
      }
      const now = new Date()
      utimes(generatedRouteTree(), now, now).catch(() => {})
    },
  })
  api.transform(
    {
      test: (resource: string) =>
        path.normalize(resource) === generatedRouteTree(),
      environments: [RSBUILD_ENVIRONMENT_NAMES.client],
      order: 'pre',
    },
    () => clientRouteTree.code(),
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
            clientRouteTree.plugin,
            routesManifestPlugin(),
            ...(opts.startPluginOpts.prerender?.enabled === true
              ? [prerenderRoutesPlugin()]
              : []),
          ],
        },
        routerPluginContext,
      )
      utils.appendPlugins(generatorPlugin)
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
