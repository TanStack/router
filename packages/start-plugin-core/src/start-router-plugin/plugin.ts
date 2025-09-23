/*
what is this plugin doing, especially compared to one already existing in the @tanstack/router-plugin package?

it configures:
1. the generator to generate both the render-route-tree as well as the server-route-tree
2. the code-splitter plugin, so it could possibly be enabled per environment (e.g. disable on the server)
3. the auto import plugin for both environments
4. the route tree client plugin, which removes the server part from the generated route tree
5. the virtual route tree plugin, which provides the route tree to the server
*/

import {
  tanStackRouterCodeSplitter,
  tanstackRouterAutoImport,
  tanstackRouterGenerator,
} from '@tanstack/router-plugin/vite'
import { normalizePath } from 'vite'
import path from 'pathe'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { routesManifestPlugin } from './generator-plugins/routes-manifest-plugin'
import { pruneServerOnlySubtrees } from './pruneServerOnlySubtrees'
import { SERVER_PROP } from './constants'
import type { Config } from '@tanstack/router-plugin'
import type {
  Generator,
  GeneratorPlugin,
  RouteNode,
} from '@tanstack/router-generator'
import type { DevEnvironment, PluginOption } from 'vite'

function isServerOnlyNode(node: RouteNode | undefined) {
  if (!node?.createFileRouteProps) {
    return false
  }
  return (
    node.createFileRouteProps.has(SERVER_PROP) &&
    node.createFileRouteProps.size === 1
  )
}

export function tanStackStartRouter(config: Config): Array<PluginOption> {
  const generatedRouteTreePath = normalizePath(
    path.resolve(config.generatedRouteTree),
  )

  let clientEnvironment: DevEnvironment | null = null
  function invalidate() {
    if (!clientEnvironment) {
      return
    }

    const mod = clientEnvironment.moduleGraph.getModuleById(
      generatedRouteTreePath,
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

  return [
    {
      name: 'tanstack-start:route-tree-client-plugin',
      enforce: 'pre',
      applyToEnvironment: (env) => env.name === VITE_ENVIRONMENT_NAMES.client,
      configureServer(server) {
        clientEnvironment = server.environments[VITE_ENVIRONMENT_NAMES.client]
      },
      load: {
        filter: { id: generatedRouteTreePath },
        async handler() {
          if (!generatorInstance) {
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
              disableTypes: true,
              enableRouteTreeFormatting: false,
            },
          })
          return buildResult.routeTreeContent
        },
      },
    },
    tanstackRouterGenerator({
      ...config,
      routeTreeFileFooter: [
        `import type { createStart } from  '@tanstack/${config.target}-start'`,
        ...config.routeTreeFileFooter,
      ],
      plugins: [clientTreeGeneratorPlugin, routesManifestPlugin()],
    }),
    tanStackRouterCodeSplitter({
      ...config,
      codeSplittingOptions: {
        ...config.codeSplittingOptions,
        deleteNodes: ['ssr', 'server'],
        addHmr: true,
      },
      plugin: {
        vite: { environmentName: VITE_ENVIRONMENT_NAMES.client },
      },
    }),
    tanStackRouterCodeSplitter({
      ...config,
      codeSplittingOptions: {
        ...config.codeSplittingOptions,
        addHmr: false,
      },
      plugin: {
        vite: { environmentName: VITE_ENVIRONMENT_NAMES.server },
      },
    }),
    tanstackRouterAutoImport(config),
  ]
}
