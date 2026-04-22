import path from 'pathe'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildRouteTreeFileFooterFromConfig } from '../start-router-plugin/route-tree-footer'
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
 *
 * These are dynamically imported to avoid hard dependency on router-plugin/rspack.
 */
export function registerRouterPlugins(
  api: RsbuildPluginAPI,
  opts: {
    getConfig: GetConfigFn
    corePluginOpts: TanStackStartCoreOptions
    startPluginOpts: TanStackStartRsbuildInputConfig
  },
): void {
  api.modifyRspackConfig(async (config, utils) => {
    const envName = utils.environment.name
    const { startConfig } = opts.getConfig()
    const routerConfig = startConfig.router

    // Generator only runs once — register for the client environment
    if (envName === RSBUILD_ENVIRONMENT_NAMES.client) {
      try {
        const { TanStackRouterGeneratorRspack } =
          await import('@tanstack/router-plugin/rspack')
        const generatorPlugin = TanStackRouterGeneratorRspack({
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
            routesManifestPlugin(),
            ...(opts.startPluginOpts?.prerender?.enabled === true
              ? [prerenderRoutesPlugin()]
              : []),
          ],
        })
        utils.appendPlugins(generatorPlugin as any)
      } catch {
        // router-plugin/rspack not available — skip
      }
    }

    if (
      envName === RSBUILD_ENVIRONMENT_NAMES.client ||
      envName === RSBUILD_ENVIRONMENT_NAMES.server
    ) {
      const isClient = envName === RSBUILD_ENVIRONMENT_NAMES.client
      try {
        const { TanStackRouterCodeSplitterRspack } =
          await import('@tanstack/router-plugin/rspack')
        const splitterPlugin = TanStackRouterCodeSplitterRspack({
          ...routerConfig,
          target: opts.corePluginOpts.framework,
          codeSplittingOptions: {
            ...routerConfig.codeSplittingOptions,
            deleteNodes: isClient ? ['ssr', 'server', 'headers'] : undefined,
            addHmr: isClient,
          },
        })
        utils.appendPlugins(splitterPlugin as any)
      } catch {
        // router-plugin/rspack not available — skip
      }
    }
  })
}
