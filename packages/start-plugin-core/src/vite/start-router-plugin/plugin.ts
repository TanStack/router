import { createRouterPluginContext } from '@tanstack/router-plugin/context'
import {
  tanStackRouterCodeSplitter,
  tanstackRouterGenerator,
} from '@tanstack/router-plugin/vite'
import path from 'pathe'
import { normalizePath } from 'vite'
import { VITE_ENVIRONMENT_NAMES } from '../../constants'
import { startGeneratorConfig } from '../../start-router-plugin/generator-config'
import { pruneServerOnlySubtrees } from '../../start-router-plugin/pruneServerOnlySubtrees'
import { hasRouteTreeSources } from '../../start-router-plugin/has-route-tree-sources'
import { SERVER_PROP } from '../../start-router-plugin/constants'
import { escapeRegExp } from '../../utils'
import type { GetConfigFn } from '../../types'
import type { TanStackStartVitePluginCoreOptions } from '../types'
import type {
  Generator,
  GeneratorPlugin,
  RouteNode,
} from '@tanstack/router-generator'
import type { DevEnvironment, PluginOption } from 'vite'
// (Vite's `Plugin` with the `configureVitest` hook that Vitest adds to it)
import type { Plugin } from 'vitest/config'
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
  /**
   * Whether Vitest resolves the config to run tests. The route tree is then
   * generated once, at startup, and only for a project that has routes; route
   * files are never written; and a route file does not have to be known to
   * the generator to lose its server-only options in client code.
   */
  isTestRun: () => boolean,
): Array<PluginOption> {
  const routerPluginContext = createRouterPluginContext()

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

  let resolvedGeneratedRouteTreePath: string | null = null
  const isGeneratedRouteTree = (id: string) =>
    normalizePath(id.replace(/\?.*$/, '')) === resolvedGeneratedRouteTreePath
  const clientTreePlugin: Plugin = {
    name: 'tanstack-start:route-tree-client-plugin',
    enforce: 'pre',
    applyToEnvironment: (env) => env.name === VITE_ENVIRONMENT_NAMES.client,
    configureServer(server) {
      clientEnvironment = server.environments[VITE_ENVIRONMENT_NAMES.client]
    },
    // Vitest stores compiled modules on disk and keys this one by the
    // generated file. What `load` returns for it also depends on the other
    // route files: the routes that only the server uses are left out. A
    // route that got its first client option leaves the generated file as it
    // is, so the key would still fit the route tree without that route.
    configureVitest({ defineCacheKeyGenerator }) {
      defineCacheKeyGenerator(({ environment, id }) => {
        if (
          environment.name === VITE_ENVIRONMENT_NAMES.client &&
          isGeneratedRouteTree(id)
        ) {
          // Not cached: `load` builds it in every run.
          return false
        }
        return undefined
      })
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
        if (!isGeneratedRouteTree(id)) {
          return null
        }
        if (!generatorInstance) {
          if (isTestRun()) {
            // No generator runs for a project without routes.
            return null
          }
          throw new Error('Generator instance not initialized')
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
    clientTreePlugin,
    tanstackRouterGenerator(
      () =>
        startGeneratorConfig({
          getConfig,
          corePluginOpts,
          prerender: startPluginOpts.prerender?.enabled === true,
          clientRouteTree: clientTreeGeneratorPlugin,
        }),
      routerPluginContext,
      {
        enabled: ({ config }) =>
          !isTestRun() ||
          hasRouteTreeSources({
            routerFilePath: getConfig().resolvedStartConfig.routerFilePath,
            generatorConfig: config,
          }),
        watch: () => !isTestRun(),
        writeRouteFiles: () => !isTestRun(),
      },
    ),
    tanStackRouterCodeSplitter(
      () => {
        const routerConfig = getConfig().startConfig.router
        return {
          ...routerConfig,
          codeSplittingOptions: {
            ...routerConfig.codeSplittingOptions,
            deleteNodes: ['ssr', 'server', 'headers'],
            // Vitest has no HMR.
            addHmr: !isTestRun(),
          },
          plugin: {
            vite: { environmentName: VITE_ENVIRONMENT_NAMES.client },
          },
        }
      },
      routerPluginContext,
      {
        deleteNodesInUnknownRoutes: isTestRun,
      },
    ),
    tanStackRouterCodeSplitter(() => {
      const routerConfig = getConfig().startConfig.router
      return {
        ...routerConfig,
        codeSplittingOptions: {
          ...routerConfig.codeSplittingOptions,
          addHmr: false,
        },
        plugin: {
          vite: { environmentName: VITE_ENVIRONMENT_NAMES.server },
        },
      }
    }, routerPluginContext),
  ]
}
