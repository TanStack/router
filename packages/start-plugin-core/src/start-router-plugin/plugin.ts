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
import type {
  Generator,
  GeneratorPlugin,
  RouteNode,
} from '@tanstack/router-generator'
import type { DevEnvironment, Plugin, PluginOption } from 'vite'
import type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from '../schema'
import type { TanStackStartVitePluginCoreOptions } from '../plugin'

function isServerOnlyNode(node: RouteNode | undefined) {
  if (!node?.createFileRouteProps) {
    return false
  }
  return (
    node.createFileRouteProps.has(SERVER_PROP) &&
    node.createFileRouteProps.size === 1
  )
}

function moduleDeclaration({
  startFilePath,
  corePluginOpts,
  generatedRouteTreePath,
}: {
  startFilePath: string
  corePluginOpts: TanStackStartVitePluginCoreOptions
  generatedRouteTreePath: string
}): string {
  let relativePath = path.relative(
    path.dirname(generatedRouteTreePath),
    startFilePath,
  )

  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath
  }

  // convert to POSIX-style for ESM imports (important on Windows)
  relativePath = relativePath.split(path.sep).join('/')

  return `
import type { createStart } from '@tanstack/${corePluginOpts.framework}-start'
import type * as startSetup from '${relativePath}'

type MaybeStartInstance = typeof startSetup extends { startInstance: { getOptions: () => any } }
  ? { start: Awaited<ReturnType<typeof startSetup.startInstance.getOptions>> }
  : {}

declare module '@tanstack/${corePluginOpts.framework}-start' {
  interface Register extends MaybeStartInstance {
    router: Awaited<ReturnType<typeof startSetup.getRouter>>
    ssr: true
  }
}`
}

export function tanStackStartRouter(
  startPluginOpts: TanStackStartInputConfig,
  getConfig: () => {
    startConfig: TanStackStartOutputConfig
    resolvedStartConfig: {
      root: string
      startFilePath: string
    }
  },
  corePluginOpts: TanStackStartVitePluginCoreOptions,
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
    const { startConfig, resolvedStartConfig } = getConfig()
    const ogRouteTreeFileFooter = startConfig.router.routeTreeFileFooter
    if (ogRouteTreeFileFooter) {
      if (Array.isArray(ogRouteTreeFileFooter)) {
        routeTreeFileFooter = ogRouteTreeFileFooter
      } else {
        routeTreeFileFooter = ogRouteTreeFileFooter()
      }
    }
    routeTreeFileFooter = [
      moduleDeclaration({
        generatedRouteTreePath: getGeneratedRouteTreePath(),
        corePluginOpts,
        startFilePath: resolvedStartConfig.startFilePath,
      }),
      ...(routeTreeFileFooter ?? []),
    ]
    return routeTreeFileFooter
  }

  const clientTreePlugin = {
    name: 'tanstack-start:route-tree-client-plugin',
    enforce: 'pre',
    applyToEnvironment: (env) => env.name === VITE_ENVIRONMENT_NAMES.client,
    configureServer(server) {
      clientEnvironment = server.environments[VITE_ENVIRONMENT_NAMES.client]
    },
    options() {
      clientTreePlugin.load.filter = {
        id: normalizePath(getGeneratedRouteTreePath()),
      }
    },
    load: {
      filter: {
        // id : startPluginOpts?.router?.generatedRouteTree
        /* we set this in the options hook since we need to wait for vite's configResolved Hook*/
      },
      async handler(code, id) {
        // TODO optimize this!
        if (id !== normalizePath(getGeneratedRouteTreePath())) {
          return null
        }
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
  } satisfies Plugin
  return [
    clientTreePlugin,
    tanstackRouterGenerator({
      ...startPluginOpts?.router,
      routeTreeFileFooter: getRouteTreeFileFooter,
      plugins: [clientTreeGeneratorPlugin, routesManifestPlugin()],
    }),
    tanStackRouterCodeSplitter({
      ...startPluginOpts?.router,
      codeSplittingOptions: {
        ...startPluginOpts?.router?.codeSplittingOptions,
        deleteNodes: ['ssr', 'server'],
        addHmr: true,
      },
      plugin: {
        vite: { environmentName: VITE_ENVIRONMENT_NAMES.client },
      },
    }),
    tanStackRouterCodeSplitter({
      ...startPluginOpts?.router,
      codeSplittingOptions: {
        ...startPluginOpts?.router?.codeSplittingOptions,
        addHmr: false,
      },
      plugin: {
        vite: { environmentName: VITE_ENVIRONMENT_NAMES.server },
      },
    }),
    tanstackRouterAutoImport(startPluginOpts?.router),
  ]
}
