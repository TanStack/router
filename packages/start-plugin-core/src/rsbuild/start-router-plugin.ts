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
          codeSplittingOptions: isClient
            ? {
                ...routerConfig.codeSplittingOptions,
                deleteNodes: ['ssr', 'server', 'headers'],
                addHmr: true,
              }
            : api.context.action === 'build'
              ? withSsrRouteOptionPruning(routerConfig.codeSplittingOptions, {
                  addHmr: false,
                })
              : { ...routerConfig.codeSplittingOptions, addHmr: false },
        },
        routerPluginContext,
      )
      utils.appendPlugins(splitterPlugin)
    }
  })

  api.transform(
    {
      test: (resource) =>
        api.context.action === 'build' &&
        opts.getConfig().startConfig.router.enableRouteGeneration !== false &&
        generatedRouteTreePath !== null &&
        (normalizePath(resource) === generatedRouteTreePath ||
          routerPluginContext.routesByFile.has(normalizePath(resource))),
      environments: [RSBUILD_ENVIRONMENT_NAMES.server],
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
      if (normalizePath(ctx.resourcePath) === generatedRouteTreePath) {
        await generatorInstance.run()
      }
      for (const routeFile of routerPluginContext.routesByFile.keys()) {
        ctx.addDependency(routeFile)
      }
      return normalizePath(ctx.resourcePath) === generatedRouteTreePath
        ? buildServerRouteTree(generatorInstance)
        : ctx.code
    },
  )
}
