import path from 'pathe'
import { createRouterPluginContext } from '@tanstack/router-plugin/context'
import {
  TanStackRouterCodeSplitterRspack,
  TanStackRouterGeneratorRspack,
} from '@tanstack/router-plugin/rspack'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildRouteTreeFileFooterFromConfig } from '../start-router-plugin/route-tree-footer'
import { pruneServerOnlySubtrees } from '../start-router-plugin/pruneServerOnlySubtrees'
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
  const clientTreeGeneratorPlugin: GeneratorPlugin = {
    name: 'start-client-tree-plugin',
    init({ generator }) {
      generatorInstance = generator
    },
  }
  const getGeneratedRouteTreePath = () => {
    const { startConfig, resolvedStartConfig } = opts.getConfig()
    return normalizePath(
      path.resolve(
        resolvedStartConfig.root,
        startConfig.router.generatedRouteTree,
      ),
    )
  }

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
            clientTreeGeneratorPlugin,
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
  api.transform(
    {
      test: (resource) =>
        opts.getConfig().startConfig.router.enableRouteGeneration !== false &&
        normalizePath(resource) === getGeneratedRouteTreePath(),
      environments: [RSBUILD_ENVIRONMENT_NAMES.client],
      order: 'pre',
    },
    async () => {
      if (!generatorInstance) {
        throw new Error('Generator instance not initialized')
      }
      const crawlingResult = await generatorInstance.getCrawlingResult()
      if (!crawlingResult) {
        throw new Error('Crawling result not available')
      }
      const buildResult = generatorInstance.buildRouteTree({
        ...crawlingResult,
        acc: {
          ...crawlingResult.acc,
          ...pruneServerOnlySubtrees(crawlingResult),
        },
        config: {
          disableTypes: true,
          enableRouteTreeFormatting: false,
          routeTreeFileHeader: [],
          routeTreeFileFooter: [],
        },
      })
      return { code: buildResult.routeTreeContent, map: null }
    },
  )
}
