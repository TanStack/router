import { createRouterPluginContext } from '@tanstack/router-plugin/context'
import {
  tanStackRouterCodeSplitter,
  tanstackRouterGenerator,
} from '@tanstack/router-plugin/vite'
import path from 'pathe'
import { normalizePath } from 'vite'
import { VITE_ENVIRONMENT_NAMES } from '../../constants'
import { routesManifestPlugin } from '../../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildRouteTreeFileFooterFromConfig } from '../../start-router-plugin/route-tree-footer'
import { pruneServerOnlySubtrees } from '../../start-router-plugin/pruneServerOnlySubtrees'
import { buildServerRouteTree } from '../../start-router-plugin/server-route-tree'
import { withSsrRouteOptionPruning } from '../../start-router-plugin/ssr-route-options'
import { SERVER_PROP } from '../../start-router-plugin/constants'
import type { GetConfigFn } from '../../types'
import type { TanStackStartVitePluginCoreOptions } from '../types'
import type {
  Generator,
  GeneratorPlugin,
  RouteNode,
} from '@tanstack/router-generator'
import type { DevEnvironment, Plugin, PluginOption } from 'vite'
import type { TanStackStartInputConfig } from '../../schema'

function isServerOnlyNode(node: RouteNode | undefined) {
  if (!node?.createFileRouteProps) {
    return false
  }
  return (
    node.createFileRouteProps.has(SERVER_PROP) &&
    node.createFileRouteProps.size === 1
  )
}

export function tanStackStartRouter(
  startPluginOpts: TanStackStartInputConfig,
  getConfig: GetConfigFn,
  corePluginOpts: TanStackStartVitePluginCoreOptions,
): Array<PluginOption> {
  const routerPluginContext = createRouterPluginContext()
  let isBuild = false
  const serverRouteEnvironmentNames = new Set([
    VITE_ENVIRONMENT_NAMES.server,
    corePluginOpts.providerEnvironmentName,
  ])

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

  let generatorInstance: Generator | null = null

  const clientTreeGeneratorPlugin: GeneratorPlugin = {
    name: 'start-client-tree-plugin',
    init({ generator }) {
      generatorInstance = generator
    },
    afterTransform({ node, prevNode }) {
      if (isServerOnlyNode(node) !== isServerOnlyNode(prevNode)) {
        invalidate()
      }
    },
  }

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
  const routeTreePlugin: Plugin = {
    name: 'tanstack-start:route-tree-plugin',
    enforce: 'pre',
    applyToEnvironment: (env) =>
      env.name === VITE_ENVIRONMENT_NAMES.client ||
      (isBuild &&
        getConfig().startConfig.router.enableRouteGeneration !== false &&
        serverRouteEnvironmentNames.has(env.name)),
    configureServer(server) {
      clientEnvironment = server.environments[VITE_ENVIRONMENT_NAMES.client]
    },
    config(_config, { command }) {
      isBuild = command === 'build'
      type LoadObjectHook = Extract<
        typeof routeTreePlugin.load,
        { filter?: unknown }
      >
      resolvedGeneratedRouteTreePath = normalizePath(
        getGeneratedRouteTreePath(),
      )
      ;(routeTreePlugin.load as LoadObjectHook).filter = {
        id: { include: new RegExp(resolvedGeneratedRouteTreePath) },
      }
    },

    load: {
      filter: {
        // this will be set in the config hook above since it relies on `config` hook being called first
      },
      async handler() {
        if (!generatorInstance) {
          throw new Error('Generator instance not initialized')
        }
        if (this.environment.name !== VITE_ENVIRONMENT_NAMES.client) {
          return buildServerRouteTree(generatorInstance)
        }
        const crawlingResult = await generatorInstance.getCrawlingResult()
        if (!crawlingResult) {
          throw new Error('Crawling result not available')
        }
        const prunedAcc = pruneServerOnlySubtrees(crawlingResult)
        const acc = {
          ...crawlingResult.acc,
          ...prunedAcc,
        }
        const buildResult = generatorInstance.buildRouteTree({
          ...crawlingResult,
          acc,
          config: {
            // importRoutesUsingAbsolutePaths: true,
            // addExtensions: true,
            disableTypes: true,
            enableRouteTreeFormatting: false,
            routeTreeFileHeader: [],
            routeTreeFileFooter: [],
          },
        })
        return { code: buildResult.routeTreeContent, map: null }
      },
    },
  }
  return [
    routeTreePlugin,
    tanstackRouterGenerator(() => {
      const routerConfig = getConfig().startConfig.router
      const plugins = [clientTreeGeneratorPlugin, routesManifestPlugin()]
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
    tanStackRouterCodeSplitter(() => {
      const routerConfig = getConfig().startConfig.router
      return {
        ...routerConfig,
        codeSplittingOptions: {
          ...routerConfig.codeSplittingOptions,
          deleteNodes: ['ssr', 'server', 'headers'],
          addHmr: true,
        },
        plugin: {
          vite: { environmentName: VITE_ENVIRONMENT_NAMES.client },
        },
      }
    }, routerPluginContext),
    ...Array.from(serverRouteEnvironmentNames).map((environmentName) =>
      tanStackRouterCodeSplitter(() => {
        const { startConfig } = getConfig()
        const routerConfig = startConfig.router
        return {
          ...routerConfig,
          codeSplittingOptions: isBuild
            ? withSsrRouteOptionPruning(routerConfig.codeSplittingOptions, {
                addHmr: false,
              })
            : { ...routerConfig.codeSplittingOptions, addHmr: false },
          plugin: {
            vite: { environmentName },
          },
        }
      }, routerPluginContext),
    ),
  ]
}
