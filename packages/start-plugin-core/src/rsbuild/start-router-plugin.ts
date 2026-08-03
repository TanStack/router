import path from 'pathe'
import { createRouterPluginContext } from '@tanstack/router-plugin/context'
import {
  TanStackRouterCodeSplitterRspack,
  TanStackRouterGeneratorRspack,
} from '@tanstack/router-plugin/rspack'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildRouteTreeFileFooterFromConfig } from '../start-router-plugin/route-tree-footer'
import { buildServerRouteTree } from '../start-router-plugin/server-route-tree'
import { withSsrRouteOptionPruning } from '../start-router-plugin/ssr-route-options'
import {
  CLIENT_ROUTE_OPTION_DELETE_NODES,
  SERVER_ROUTE_OPTION_DELETE_NODES,
} from '../start-router-plugin/constants'
import { shouldStripRouteOptionsFromServer } from '../prerender-route-options-env'
import { normalizePath } from '../utils'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { RsbuildPluginAPI } from '@rsbuild/core'
import type { GetConfigFn, TanStackStartCoreOptions } from '../types'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type { Generator, GeneratorPlugin } from '@tanstack/router-generator'

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
  let generatorInstance: Generator | null = null
  let generatedRouteTreePath: string | null = null
  let routesDirectoryPath: string | null = null
  const serverTreeGeneratorPlugin: GeneratorPlugin = {
    name: 'start-server-tree-plugin',
    init({ generator }) {
      generatorInstance = generator
    },
  }

  api.modifyRspackConfig((config, utils) => {
    const envName = utils.environment.name
    const { startConfig, resolvedStartConfig } = opts.getConfig()
    const routerConfig = startConfig.router
    generatedRouteTreePath = normalizePath(
      path.resolve(resolvedStartConfig.root, routerConfig.generatedRouteTree),
    )
    routesDirectoryPath = path.resolve(
      resolvedStartConfig.root,
      routerConfig.routesDirectory,
    )

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
            serverTreeGeneratorPlugin,
            routesManifestPlugin(),
            ...(opts.startPluginOpts.prerender?.enabled !== false
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
      envName === RSBUILD_ENVIRONMENT_NAMES.server ||
      envName === RSBUILD_ENVIRONMENT_NAMES.prerender
    ) {
      const isClient = envName === RSBUILD_ENVIRONMENT_NAMES.client
      const isServer = envName === RSBUILD_ENVIRONMENT_NAMES.server
      const deleteNodes = isClient
        ? CLIENT_ROUTE_OPTION_DELETE_NODES
        : isServer && shouldStripRouteOptionsFromServer(startConfig)
          ? SERVER_ROUTE_OPTION_DELETE_NODES
          : undefined
      const splitterPlugin = TanStackRouterCodeSplitterRspack(
        {
          ...routerConfig,
          target: opts.corePluginOpts.framework,
          codeSplittingOptions: isClient
            ? {
                ...routerConfig.codeSplittingOptions,
                deleteNodes,
                addHmr: true,
              }
            : withSsrRouteOptionPruning(routerConfig.codeSplittingOptions, {
                deleteNodes,
                addHmr: false,
              }),
        },
        routerPluginContext,
      )
      utils.appendPlugins(splitterPlugin)
    }
  })

  api.transform(
    {
      test: (resource) =>
        generatedRouteTreePath !== null &&
        normalizePath(resource) === generatedRouteTreePath,
      environments: [
        RSBUILD_ENVIRONMENT_NAMES.server,
        RSBUILD_ENVIRONMENT_NAMES.prerender,
      ],
      order: 'pre',
    },
    async (ctx) => {
      if (!generatorInstance) {
        throw new Error('Generator instance not initialized')
      }
      if (!routesDirectoryPath) {
        throw new Error('Routes directory not initialized')
      }
      ctx.addContextDependency(routesDirectoryPath)
      await generatorInstance.run()
      for (const routeFile of generatorInstance.getRoutesByFileMap().keys()) {
        ctx.addDependency(routeFile)
      }
      return buildServerRouteTree(generatorInstance)
    },
  )
}
